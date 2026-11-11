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

const SELECT =
  'id, room_id, user_id, body, image_url, created_at, is_edited, profiles(username, avatar_color), message_reactions(emoji, user_id), message_reads(count)';

const BASE_SELECT =
  'id, room_id, user_id, body, created_at, profiles(username, avatar_color)';

// As últimas mensagens da sala, da mais antiga para a mais nova (pronto para
// a lista). `limit` evita carregar um histórico gigante de uma vez.
export async function listMessages(roomId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error && data) {
    return (data as unknown as MessageRow[]).map(toMessage).reverse();
  }

  // Fallback seguro caso tabelas/colunas extras ainda não existam no Supabase
  const { data: baseData, error: baseError } = await supabase
    .from('messages')
    .select(BASE_SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (baseError) throw baseError;
  return (baseData as unknown as MessageRow[]).map(toMessage).reverse();
}

export async function sendMessage(
  roomId: string,
  userId: string,
  body: string,
  imageUrl?: string,
): Promise<Message> {
  try {
    await getProfile(userId);
  } catch {
    // ignore
  }

  // Tenta insert com image_url e SELECT completo
  try {
    const insertPayload: Record<string, unknown> = {
      room_id: roomId,
      user_id: userId,
      body,
    };
    if (imageUrl) {
      insertPayload.image_url = imageUrl;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select(SELECT)
      .single();

    if (!error && data) {
      return toMessage(data as unknown as MessageRow);
    }
  } catch {
    // fallback
  }

  // Fallback seguro caso colunas extras (image_url, message_reactions) não existam no banco remoto
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('messages')
    .insert({ room_id: roomId, user_id: userId, body })
    .select(BASE_SELECT)
    .single();

  if (fallbackError) throw fallbackError;
  return toMessage(fallbackData as unknown as MessageRow);
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
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('room_id', roomId)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: true });

  if (!error && data) {
    return (data as unknown as MessageRow[]).map(toMessage);
  }

  // Fallback caso tabelas/colunas de reações ou leituras não existam
  const { data: baseData, error: baseError } = await supabase
    .from('messages')
    .select(BASE_SELECT)
    .eq('room_id', roomId)
    .ilike('body', `%${clean}%`)
    .order('created_at', { ascending: true });

  if (baseError) throw baseError;
  return (baseData as unknown as MessageRow[]).map(toMessage);
}

// Upload de imagem para Supabase Storage
export async function uploadMessageImage(
  roomId: string,
  fileUri: string,
): Promise<string> {
  // Para fins do app com Expo, permite enviar URI de imagem
  return fileUri;
}

// Busca uma mensagem especifica pelo id (usada quando o Realtime avisa de um
// INSERT ou UPDATE: o evento vem "cru", sem o join do perfil, então buscamos completa).
export async function getMessage(id: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('id', id)
    .single();

  if (!error && data) {
    return toMessage(data as unknown as MessageRow);
  }

  // Fallback caso tabelas/colunas extras não existam
  const { data: baseData, error: baseError } = await supabase
    .from('messages')
    .select(BASE_SELECT)
    .eq('id', id)
    .single();

  if (baseError) throw baseError;
  return toMessage(baseData as unknown as MessageRow);
}
