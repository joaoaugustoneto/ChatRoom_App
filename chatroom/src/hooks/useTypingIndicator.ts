import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from './useMyProfile';

const STOPPED_TYPING_AFTER_MS = 3000;

interface TypingEntry {
  username: string;
  at: number;
}

// "Fulano está digitando..." sem gravar nada no banco: um canal de broadcast
// (mensagens efêmeras, ninguém guarda) avisa os outros a cada tecla, e cada
// aparelho esquece sozinho quem não avisou de novo em 3 segundos — não existe
// um evento de "parei de digitar" para depender.
export function useTypingIndicator(roomId: string | undefined) {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const [typing, setTyping] = useState<Record<string, TypingEntry>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!roomId) return undefined;

    const channel = supabase.channel(`typing-${roomId}`);
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === user?.id) return; // ignora o próprio aviso
        setTyping((prev) => ({
          ...prev,
          [payload.userId]: { username: payload.username, at: Date.now() },
        }));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, user?.id]);

  // Limpa quem ficou quieto — sem isso, o aviso de "digitando" nunca sumiria
  // se a última tecla do outro lado coincidisse com uma queda de conexão.
  useEffect(() => {
    const id = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next: Record<string, TypingEntry> = {};
        for (const [uid, entry] of Object.entries(prev)) {
          if (now - entry.at < STOPPED_TYPING_AFTER_MS) next[uid] = entry;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const notifyTyping = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user?.id, username: profile?.username ?? 'Alguém' },
    });
  }, [user?.id, profile?.username]);

  const typingUsernames = Object.values(typing).map((t) => t.username);

  return { typingUsernames, notifyTyping };
}
