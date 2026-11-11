import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from './useMyProfile';

export interface OnlineUser {
  userId: string;
  username: string;
}

// "Quem está online agora, nesta sala" — sem nenhuma tabela no banco. O
// Presence do Supabase Realtime mantém essa lista em memória, compartilhada
// entre todo mundo que está com o canal aberto, e a atualiza sozinho quando
// alguém entra ou sai (inclusive por queda de conexão).
export function useRoomPresence(roomId: string | undefined): OnlineUser[] {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!roomId || !user) return undefined;

    const channel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ username: string }>();
        const list = Object.entries(state).map(([userId, metas]) => ({
          userId,
          username: metas[0]?.username ?? 'Alguém',
        }));
        setOnline(list);
      })
      .subscribe(async (status) => {
        // Só "avisa presença" depois de confirmado que o canal está aberto.
        if (status === 'SUBSCRIBED') {
          await channel.track({ username: profile?.username ?? 'Você' });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user, profile?.username]);

  return online;
}
