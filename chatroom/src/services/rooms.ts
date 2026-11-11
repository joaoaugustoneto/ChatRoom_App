import { supabase } from '@/lib/supabase';
import type { Room } from '@/types';

interface RoomRow {
  id: string;
  name: string;
  description: string;
  emoji: string;
  created_by: string;
  created_at: string;
  is_private?: boolean;
  invite_code?: string;
  room_members: { count: number }[];
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    emoji: row.emoji,
    createdBy: row.created_by,
    createdAt: row.created_at,
    isPrivate: Boolean(row.is_private),
    inviteCode: row.invite_code,
    memberCount: row.room_members?.[0]?.count ?? 0,
  };
}

// Todas as salas, com a contagem de membros (uma consulta só, sem N+1).
export async function listRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_members (count)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as RoomRow[]).map(toRoom);
}

// Os ids das salas em que o usuário logado já está para marcar "Minhas salas".
export async function listMyRoomIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('room_members').select('room_id');
  if (error) throw error;
  return new Set((data as { room_id: string }[]).map((r) => r.room_id));
}

export async function getRoom(id: string): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_members (count)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return toRoom(data as RoomRow);
}

export async function createRoom(
  name: string,
  description: string,
  emoji: string,
  userId: string,
  isPrivate = false,
  inviteCode?: string,
): Promise<string> {
  const generatedCode = isPrivate
    ? inviteCode?.trim().toUpperCase() ||
      Math.random().toString(36).slice(2, 8).toUpperCase()
    : null;

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      name,
      description,
      emoji,
      created_by: userId,
      is_private: isPrivate,
      invite_code: generatedCode,
    })
    .select('id')
    .single();

  if (error) throw error;

  const room = data as { id: string };

  const { error: joinError } = await supabase
    .from('room_members')
    .insert({ room_id: room.id, user_id: userId });

  if (joinError) throw joinError;
  return room.id;
}

export async function joinRoom(
  roomId: string,
  userId: string,
  inviteCode?: string,
): Promise<void> {
  const room = await getRoom(roomId);
  if (room.isPrivate) {
    if (
      !inviteCode ||
      inviteCode.trim().toUpperCase() !== room.inviteCode?.toUpperCase()
    ) {
      throw new Error('Código de convite incorreto para esta sala privada.');
    }
  }

  const { error } = await supabase
    .from('room_members')
    .insert({ room_id: roomId, user_id: userId });
  if (error) throw error;
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw error;
}

interface MemberRow {
  user_id: string;
  profiles: { username: string; avatar_color: string } | null;
}

export interface RoomMember {
  userId: string;
  username: string;
  avatarColor: string;
}

export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select('user_id, profiles(username, avatar_color)')
    .eq('room_id', roomId);

  if (error) throw error;

  return (data as unknown as MemberRow[]).map((r) => ({
    userId: r.user_id,
    username: r.profiles?.username ?? 'Alguém',
    avatarColor: r.profiles?.avatar_color ?? '#2563EB',
  }));
}
