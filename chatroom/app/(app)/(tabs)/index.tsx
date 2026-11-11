import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingView } from '@/components/StateViews';
import { RoomCard } from '@/components/RoomCard';
import { useDirectRooms, useMyRoomIds, useRooms } from '@/hooks/useRooms';
import { colors, radius, spacing } from '@/theme';
import { friendlyError } from '@/utils/errors';

export default function RoomsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'public' | 'direct'>('public');

  const {
    data: publicRooms,
    isLoading: isPublicLoading,
    isError: isPublicError,
    error: publicError,
    refetch: refetchPublic,
    isRefetching: isPublicRefetching,
  } = useRooms();

  const {
    data: directRooms,
    isLoading: isDirectLoading,
    isError: isDirectError,
    error: directError,
    refetch: refetchDirect,
    isRefetching: isDirectRefetching,
  } = useDirectRooms();

  const { data: myRoomIds } = useMyRoomIds();
  const memberIds = useMemo(() => myRoomIds ?? new Set<string>(), [myRoomIds]);

  const isLoading = activeTab === 'public' ? isPublicLoading : isDirectLoading;
  const isError = activeTab === 'public' ? isPublicError : isDirectError;
  const error = activeTab === 'public' ? publicError : directError;
  const refetch = activeTab === 'public' ? refetchPublic : refetchDirect;
  const isRefetching = activeTab === 'public' ? isPublicRefetching : isDirectRefetching;
  const currentRooms = activeTab === 'public' ? (publicRooms ?? []) : (directRooms ?? []);

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorState message={friendlyError(error)} onRetry={refetch} />;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <FlatList
        data={currentRooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>ChatRoom</Text>
            <Text style={styles.subtitle}>
              {activeTab === 'public'
                ? 'Entre em uma sala e converse em grupo em tempo real.'
                : 'Suas conversas diretas e privadas 1 para 1.'}
            </Text>

            <View style={styles.tabContainer}>
              <Pressable
                onPress={() => setActiveTab('public')}
                style={[
                  styles.tabButton,
                  activeTab === 'public' && styles.tabButtonActive,
                ]}
              >
                <Ionicons
                  name="people"
                  size={16}
                  color={activeTab === 'public' ? colors.primary : colors.muted}
                />
                <Text
                  style={[styles.tabText, activeTab === 'public' && styles.tabTextActive]}
                >
                  Salas Públicas
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('direct')}
                style={[
                  styles.tabButton,
                  activeTab === 'direct' && styles.tabButtonActive,
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses"
                  size={16}
                  color={activeTab === 'direct' ? colors.primary : colors.muted}
                />
                <Text
                  style={[styles.tabText, activeTab === 'direct' && styles.tabTextActive]}
                >
                  Mensagens Diretas
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          activeTab === 'public' ? (
            <EmptyState
              icon="chatbubbles-outline"
              title="Nenhuma sala ainda"
              message="Crie a primeira sala para começar a conversar."
            />
          ) : (
            <EmptyState
              icon="lock-closed-outline"
              title="Nenhuma conversa direta"
              message="Para conversar em privado com alguém, toque numa mensagem do usuário dentro de qualquer sala."
            />
          )
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            isMember={memberIds.has(item.id) || Boolean(item.isDirect)}
            onPress={() => router.push(`/room/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
          />
        }
      />
      {activeTab === 'public' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova sala"
          onPress={() => router.push('/room/new')}
          style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
        >
          <Ionicons name="add" size={28} color={colors.onPrimary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: 100,
    flexGrow: 1,
  },
  header: { marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: spacing.md },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F6',
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
