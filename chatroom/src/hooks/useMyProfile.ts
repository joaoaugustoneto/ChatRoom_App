import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getProfile, updateUsername } from '@/services/profile';

export function useMyProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: Boolean(user),
  });
}

export function useUpdateUsername() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => {
      if (!user) throw new Error('Faça login para editar o perfil.');
      return updateUsername(user.id, username);
    },
    onSuccess: (_data, newUsername) => {
      queryClient.setQueryData(['profile', user?.id], (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...(old as Record<string, unknown>), username: newUsername };
        }
        return {
          id: user?.id,
          username: newUsername,
          avatarColor: '#2563EB',
        };
      });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
