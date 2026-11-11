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
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return toProfile(data as ProfileRow);
  }

  // Auto-recuperação: se o perfil não existe (ex: usuário criado antes do gatilho ou via dashboard), cria agora
  const { data: authData } = await supabase.auth.getUser();
  const rawName =
    authData?.user?.user_metadata?.username ||
    authData?.user?.email?.split('@')[0] ||
    'Usuário';
  const cleanName = rawName.slice(0, 30);
  const colorsList = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#0D9488'];
  const avatarColor = colorsList[Math.floor(Math.random() * colorsList.length)];

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      username: cleanName,
      avatar_color: avatarColor,
    })
    .select('id, username, avatar_color')
    .single();

  if (insertError) {
    console.warn('Não foi possível persistir perfil automaticamente:', insertError);
    return {
      id: userId,
      username: cleanName,
      avatarColor,
    };
  }

  return toProfile(created as ProfileRow);
}

export async function updateUsername(userId: string, username: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);
  if (error) throw error;
}
