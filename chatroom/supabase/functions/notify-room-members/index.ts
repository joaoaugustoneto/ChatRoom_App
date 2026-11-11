// Edge Function do Supabase (Deno runtime) para envio de Push Notifications
// Acionada via Database Webhook após inserção em public.messages

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface MessageWebhookPayload {
  type: 'INSERT';
  table: 'messages';
  record: {
    id: string;
    room_id: string;
    user_id: string;
    body: string;
    image_url?: string;
    created_at: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload: MessageWebhookPayload = await req.json();
    const { record } = payload;

    if (!record || !record.room_id || !record.user_id) {
      return new Response(JSON.stringify({ error: 'Payload inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Inicializa cliente Supabase administrativo com Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Busca nome da sala e remetente
    const [roomRes, senderRes] = await Promise.all([
      supabase.from('rooms').select('name').eq('id', record.room_id).single(),
      supabase.from('profiles').select('username').eq('id', record.user_id).single(),
    ]);

    const roomName = roomRes.data?.name ?? 'ChatRoom';
    const senderUsername = senderRes.data?.username ?? 'Alguém';

    // 2. Busca membros da sala (exceto o próprio remetente)
    const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', record.room_id)
      .neq('user_id', record.user_id);

    if (membersError || !members?.length) {
      return new Response(
        JSON.stringify({ message: 'Nenhum outro membro na sala para notificar' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const memberIds = members.map((m: { user_id: string }) => m.user_id);

    // 3. Busca tokens de push registrados para esses membros
    const { data: tokens, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('push_token')
      .in('user_id', memberIds);

    if (tokensError || !tokens?.length) {
      return new Response(
        JSON.stringify({ message: 'Nenhum token de push encontrado' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 4. Monta mensagens de push para a API do Expo
    const pushMessages = tokens.map((t: { push_token: string }) => ({
      to: t.push_token,
      sound: 'default',
      title: roomName,
      body: `${senderUsername}: ${record.body}`,
      data: {
        roomId: record.room_id,
        messageId: record.id,
      },
    }));

    // 5. Envia notificações para o Expo Push Service
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushMessages),
    });

    const expoResult = await expoResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        sentCount: pushMessages.length,
        expoResult,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
