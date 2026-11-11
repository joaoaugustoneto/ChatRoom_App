import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  addReaction,
  deleteMessage,
  editMessage,
  getMessage,
  listMessages,
  removeReaction,
  sendMessage,
} from '@/services/messages';
import { useMyProfile } from './useMyProfile';
import type { Message } from '@/types';

// Histórico da sala e inscrição no Realtime: qualquer INSERT, UPDATE ou DELETE na
// tabela "messages" desta sala chega aqui e atualiza a lista sozinho, em
// qualquer aparelho que esteja com a tela aberta.
export function useMessages(roomId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', roomId],
    queryFn: () => listMessages(roomId as string),
    enabled: Boolean(roomId),
  });

  useEffect(() => {
    if (!roomId) return undefined;

    const channel = supabase
      .channel(`room-messages-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const id = payload.new.id as string;
          try {
            const full = await getMessage(id);
            queryClient.setQueryData<Message[]>(['messages', roomId], (old) => {
              if (!old) return [full];
              if (old.some((m) => m.id === full.id)) return old;
              return [...old, full];
            });
          } catch {
            // A mensagem pode ter sido apagada entre o evento e a busca — ignore.
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const id = payload.new.id as string;
          try {
            const full = await getMessage(id);
            queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
              old?.map((m) => (m.id === id ? full : m)),
            );
          } catch {
            // Ignorar se a mensagem foi removida no intervalo
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const id = payload.old.id as string;
          queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
            old?.filter((m) => m.id !== id),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        async (payload) => {
          const messageId =
            (payload.new as { message_id?: string })?.message_id ??
            (payload.old as { message_id?: string })?.message_id;
          if (messageId) {
            try {
              const full = await getMessage(messageId);
              queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
                old?.map((m) => (m.id === messageId ? full : m)),
              );
            } catch {
              // ignore
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, queryClient]);

  return query;
}

// Envia com atualização otimista: a mensagem aparece na hora, com um id
// temporário, e é substituída pela confirmada assim que o servidor responde.
export function useSendMessage(roomId: string) {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      if (!user) throw new Error('Faça login para enviar mensagens.');

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const optimistic: Message = {
        id: tempId,
        roomId,
        userId: user.id,
        body,
        createdAt: new Date().toISOString(),
        username: profile?.username ?? 'Você',
        avatarColor: profile?.avatarColor ?? '#2563EB',
      };

      queryClient.setQueryData<Message[]>(['messages', roomId], (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      try {
        const real = await sendMessage(roomId, user.id, body);
        queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
          old?.map((m) => (m.id === tempId ? real : m)),
        );
        return real;
      } catch (error) {
        queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
          old?.filter((m) => m.id !== tempId),
        );
        throw error;
      }
    },
  });
}

export function useEditMessage(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newBody }: { id: string; newBody: string }) =>
      editMessage(id, newBody),
    onMutate: async ({ id, newBody }) => {
      queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
        old?.map((m) => (m.id === id ? { ...m, body: newBody, isEdited: true } : m)),
      );
    },
  });
}

export function useDeleteMessage(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMessage(id),
    onMutate: async (id) => {
      queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
        old?.filter((m) => m.id !== id),
      );
    },
  });
}

export function useToggleReaction(roomId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      emoji,
      hasReacted,
    }: {
      messageId: string;
      emoji: string;
      hasReacted: boolean;
    }) => {
      if (!user) throw new Error('Faça login para reagir.');
      if (hasReacted) {
        await removeReaction(messageId, user.id, emoji);
      } else {
        await addReaction(messageId, user.id, emoji);
      }
      const full = await getMessage(messageId);
      return full;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(['messages', roomId], (old) =>
        old?.map((m) => (m.id === updated.id ? updated : m)),
      );
    },
  });
}
