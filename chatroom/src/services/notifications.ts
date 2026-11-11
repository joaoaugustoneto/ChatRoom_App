import { supabase } from '@/lib/supabase';

export async function savePushToken(userId: string, pushToken: string): Promise<void> {
  const { error } = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      push_token: pushToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}

export async function deletePushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}
