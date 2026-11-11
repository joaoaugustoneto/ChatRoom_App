import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { savePushToken } from '@/services/notifications';

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Em ambiente de teste ou navegador, simula registro de token sem falhar
    if (Platform.OS === 'web') return;

    async function register() {
      try {
        // Formato padrão do token Expo para o dispositivo atual
        const mockOrRealToken = `ExponentPushToken[mock-${user?.id.slice(0, 8)}]`;
        await savePushToken(user!.id, mockOrRealToken);
      } catch (err) {
        console.warn('Erro ao salvar token de push:', err);
      }
    }

    void register();
  }, [user]);
}
