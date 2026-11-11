import { Redirect, Stack } from 'expo-router';
import { LoadingView } from '@/components/StateViews';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme';

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingView />;
  if (!session) return <Redirect href="/login" />; // sem sessão: vai para o login
  
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="room/[id]" options={{ title: '' }} />
      <Stack.Screen name="room/new" options={{ title: 'Nova sala' }} />
    </Stack>
  );
}
