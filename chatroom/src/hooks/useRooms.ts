import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  createRoom,
  getOrCreateDirectRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  listDirectRooms,
  listMyRoomIds,
  listRoomMembers,
  listRooms,
} from '@/services/rooms';

export const useRooms = () =>
  useQuery({ queryKey: ['rooms', 'list'], queryFn: listRooms });

export const useDirectRooms = () =>
  useQuery({ queryKey: ['rooms', 'direct'], queryFn: listDirectRooms });

export const useMyRoomIds = () =>
  useQuery({ queryKey: ['rooms', 'mine'], queryFn: listMyRoomIds });

export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: ['rooms', 'detail', id],
    queryFn: () => getRoom(id as string),
    enabled: Boolean(id),
  });
}

export function useRoomMembers(id: string | undefined) {
  return useQuery({
    queryKey: ['rooms', 'members', id],
    queryFn: () => listRoomMembers(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateRoom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      description,
      emoji,
      isPrivate,
      inviteCode,
    }: {
      name: string;
      description: string;
      emoji: string;
      isPrivate?: boolean;
      inviteCode?: string;
    }) => {
      if (!user) throw new Error('Faça login para criar uma sala.');
      return createRoom(name, description, emoji, user.id, isPrivate, inviteCode);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useJoinRoom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: string | { roomId: string; inviteCode?: string }) => {
      if (!user) throw new Error('Faça login para entrar na sala.');
      const roomId = typeof args === 'string' ? args : args.roomId;
      const inviteCode = typeof args === 'string' ? undefined : args.inviteCode;
      return joinRoom(roomId, user.id, inviteCode);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useLeaveRoom() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => {
      if (!user) throw new Error('Faça login para sair da sala.');
      return leaveRoom(roomId, user.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useGetOrCreateDirectRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetUserId: string) => getOrCreateDirectRoom(targetUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rooms'] }),
  });
}
