import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface ProfileRow {
  id: string;
  username: string;
  avatar_color: string;
}

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  username: row.username,
  avatarColor: row.avatar_color,
});

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_color')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function updateUsername(userId: string, username: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);
  if (error) throw error;
}
