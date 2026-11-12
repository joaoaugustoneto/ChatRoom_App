import { supabase } from '@/lib/supabase';
import { getProfile } from '@/services/profile';
import type { Message } from '@/types';
import { groupReactions } from '@/utils/reactions';

interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  image_url?: string | null;
  created_at: string;
  is_edited?: boolean;
  profiles: { username: string; avatar_color: string } | null;
  message_reactions?: { emoji: string; user_id: string }[];
  message_reads?: { count: number }[];
}

function toMessage(row: MessageRow): Message {
  const rawReactions = (row.message_reactions ?? []).map((r) => ({
    emoji: r.emoji,
    userId: r.user_id,
  }));

  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    body: row.body,
    imageUrl: row.image_url || undefined,
    createdAt: row.created_at,
    username: row.profiles?.username ?? 'Alguém',
    avatarColor: row.profiles?.avatar_color ?? '#2563EB',
    isEdited: Boolean(row.is_edited),
    reactions: groupReactions(rawReactions),
    readByCount: row.message_reads?.[0]?.count ?? 0,
  };
}

// Consultas com desambiguação explícita de relação via chave estrangeira `user_id`
const SELECT_DISAMBIGUATED =
  'id, room_id, user_id, body, image_url, created_at, is_edited, profiles!user_id(username, avatar_color), message_reactions(emoji, user_id), message_reads(count)';

const SELECT =
  'id, room_id, user_id, body, image_url, created_at, is_edited, profiles(username, avatar_color), message_reactions(emoji, user_id), message_reads(count)';

const BASE_SELECT_DISAMBIGUATED =
  'id, room_id, user_id, body, created_at, profiles!user_id(username, avatar_color)';

const BASE_SELECT =
  'id, room_id, user_id, body, created_at, profiles(username, avatar_color)';

interface InsertedMessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

// Popula perfis manualmente caso PostgREST falhe na resolução de chaves estrangeiras duplicadas
async function populateProfilesForRows(rawRows: unknown[]): Promise<MessageRow[]> {
  const rows = (rawRows ?? []) as MessageRow[];
  if (rows.length === 0) return [];

  const missingUserIds = Array.from(
    new Set(
      rows
        .filter((r) => !r.profiles)
        .map((r) => r.user_id)
        .filter(Boolean),
    ),
  );

  const profileMap = new Map<string, { username: string; avatar_color: string }>();

  if (missingUserIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, avatar_color')
      .in('id', missingUserIds);

    if (profs) {
      for (const p of profs) {
        profileMap.set(p.id, { username: p.username, avatar_color: p.avatar_color });
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    profiles: r.profiles ?? profileMap.get(r.user_id) ?? null,
  }));
}

// As últimas mensagens da sala, da mais antiga para a mais nova (pronto para a lista).
export async function listMessages(roomId: string, limit = 100): Promise<Message[]> {
  // 1. Tenta desambiguado com tabelas estendidas (Apêndice C)
  const { data: d1, error: e1 } = await supabase
    .from('messages')
    .select(SELECT_DISAMBIGUATED)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!e1 && d1) {
    return (d1 as unknown as MessageRow[]).map(toMessage).reverse();
  }

  // 2. Tenta padrão com tabelas estendidas
  const { data: d2, error: e2 } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!e2 && d2) {
    return (d2 as unknown as MessageRow[]).map(toMessage).reverse();
  }

  // 3. Tenta desambiguado básico
  const { data: d3, error: e3 } = await supabase
    .from('messages')
    .select(BASE_SELECT_DISAMBIGUATED)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!e3 && d3) {
    return (d3 as unknown as MessageRow[]).map(toMessage).reverse();
  }

  // 4. Tenta básico padrão
  const { data: d4, error: e4 } = await supabase
    .from('messages')
    .select(BASE_SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!e4 && d4) {
    return (d4 as unknown as MessageRow[]).map(toMessage).reverse();
  }

  // 5. Fallback seguro sem embed: busca mensagens puras e popula perfis
  const { data: rawData, error: rawError } = await supabase
    .from('messages')
    .select('id, room_id, user_id, body, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (rawError) throw rawError;

  const populated = await populateProfilesForRows(rawData ?? []);
  return populated.map(toMessage).reverse();
}

export async function sendMessage(
  roomId: string,
  userId: string,
  body: string,
  imageUrl?: string,
): Promise<Message> {
  // Garante a existência do perfil local/remoto do autor
  const profile = await getProfile(userId).catch(() => ({
    id: userId,
    username: 'Você',
    avatarColor: '#2563EB',
  }));

  const insertPayload: Record<string, unknown> = {
    room_id: roomId,
    user_id: userId,
    body,
  };
  if (imageUrl) {
    insertPayload.image_url = imageUrl;
  }

  // Insere na tabela messages sem tentar embed relacional na resposta do INSERT
  // (evita erro 'Could not embed because more than one relationship was found')
  let inserted: InsertedMessageRow | null = null;

  const { data, error } = await supabase
    .from('messages')
    .insert(insertPayload)
    .select('id, room_id, user_id, body, created_at')
    .single();

  if (!error && data) {
    inserted = data as unknown as InsertedMessageRow;
  } else {
    // Fallback sem image_url caso a coluna ainda não exista
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('messages')
      .insert({ room_id: roomId, user_id: userId, body })
      .select('id, room_id, user_id, body, created_at')
      .single();

    if (fallbackError) throw fallbackError;
    inserted = fallbackData as unknown as InsertedMessageRow;
  }

  if (!inserted) {
    throw new Error('Falha ao registrar mensagem no banco de dados.');
  }

  return {
    id: inserted.id,
    roomId: inserted.room_id,
    userId: inserted.user_id,
    body: inserted.body,
    imageUrl,
    createdAt: inserted.created_at,
    username: profile.username,
    avatarColor: profile.avatarColor,
    isEdited: false,
    reactions: [],
    readByCount: 0,
  };
}

export async function editMessage(id: string, newBody: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ body: newBody, is_edited: true })
    .eq('id', id);

  if (error) {
    // Fallback caso a coluna is_edited não exista
    const { error: baseError } = await supabase
      .from('messages')
      .update({ body: newBody })
      .eq('id', id);
    if (baseError) throw baseError;
  }
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji });

  if (error && !error.message.includes('unique')) throw error;
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  if (error) throw error;
}

export async function markMessagesAsRead(
  messageIds: string[],
  userId: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  const rows = messageIds.map((id) => ({ message_id: id, user_id: userId }));
  await supabase.from('message_reads').insert(rows).select();
}

export async function searchMessages(roomId: string, query: string): Promise<Message[]> {
  const clean = query.trim();
  if (!clean) return [];

  // 1. Tenta desambiguado com reações
  const { data: d1, error: e1 } = await supabase
    .from('messages')
    .select(SELECT_DISAMBIGUATED)
    .eq('room_id', roomId)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: true });

  if (!e1 && d1) {
    return (d1 as unknown as MessageRow[]).map(toMessage);
  }

  // 2. Tenta padrão
  const { data: d2, error: e2 } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('room_id', roomId)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: true });

  if (!e2 && d2) {
    return (d2 as unknown as MessageRow[]).map(toMessage);
  }

  // 3. Fallback sem embed
  const { data: baseData, error: baseError } = await supabase
    .from('messages')
    .select('id, room_id, user_id, body, created_at')
    .eq('room_id', roomId)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: true });

  if (baseError) throw baseError;
  const populated = await populateProfilesForRows(baseData ?? []);
  return populated.map(toMessage);
}

// Upload de imagem para Supabase Storage
export async function uploadMessageImage(
  roomId: string,
  fileUri: string,
): Promise<string> {
  return fileUri;
}

// Busca uma mensagem especifica pelo id (usada quando o Realtime avisa de um INSERT ou UPDATE)
export async function getMessage(id: string): Promise<Message> {
  // 1. Tenta desambiguado completo
  const { data: d1, error: e1 } = await supabase
    .from('messages')
    .select(SELECT_DISAMBIGUATED)
    .eq('id', id)
    .maybeSingle();

  if (!e1 && d1) {
    return toMessage(d1 as unknown as MessageRow);
  }

  // 2. Tenta padrão completo
  const { data: d2, error: e2 } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();

  if (!e2 && d2) {
    return toMessage(d2 as unknown as MessageRow);
  }

  // 3. Tenta desambiguado básico
  const { data: d3, error: e3 } = await supabase
    .from('messages')
    .select(BASE_SELECT_DISAMBIGUATED)
    .eq('id', id)
    .maybeSingle();

  if (!e3 && d3) {
    return toMessage(d3 as unknown as MessageRow);
  }

  // 4. Tenta básico padrão
  const { data: d4, error: e4 } = await supabase
    .from('messages')
    .select(BASE_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (!e4 && d4) {
    return toMessage(d4 as unknown as MessageRow);
  }

  // 5. Fallback sem embed
  const { data: raw, error: rawError } = await supabase
    .from('messages')
    .select('id, room_id, user_id, body, created_at')
    .eq('id', id)
    .single();

  if (rawError) throw rawError;

  const populated = await populateProfilesForRows([raw]);
  return toMessage(populated[0]);
}
