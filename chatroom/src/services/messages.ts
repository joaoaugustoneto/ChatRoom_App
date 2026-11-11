import { supabase } from '@/lib/supabase';
import type { Message } from '@/types';
import { groupReactions } from '@/utils/reactions';

interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
  is_edited?: boolean;
  profiles: { username: string; avatar_color: string } | null;
  message_reactions?: { emoji: string; user_id: string }[];
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
    createdAt: row.created_at,
    username: row.profiles?.username ?? 'Alguém',
    avatarColor: row.profiles?.avatar_color ?? '#2563EB',
    isEdited: Boolean(row.is_edited),
    reactions: groupReactions(rawReactions),
  };
}

const SELECT =
  'id, room_id, user_id, body, created_at, is_edited, profiles(username, avatar_color), message_reactions(emoji, user_id)';

// As últimas mensagens da sala, da mais antiga para a mais nova (pronto para
// a lista). `limit` evita carregar um histórico gigante de uma vez.
export async function listMessages(roomId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as MessageRow[]).map(toMessage).reverse();
}

export async function sendMessage(
  roomId: string,
  userId: string,
  body: string,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, user_id: userId, body })
    .select(SELECT)
    .single();

  if (error) throw error;
  return toMessage(data as unknown as MessageRow);
}

export async function editMessage(id: string, newBody: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ body: newBody, is_edited: true })
    .eq('id', id);

  if (error) throw error;
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

// Busca uma mensagem especifica pelo id (usada quando o Realtime avisa de um
// INSERT ou UPDATE: o evento vem "cru", sem o join do perfil, então buscamos completa).
export async function getMessage(id: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return toMessage(data as unknown as MessageRow);
}
