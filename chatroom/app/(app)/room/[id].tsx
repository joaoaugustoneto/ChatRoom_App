import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MessageBubble } from '@/components/MessageBubble';
import { ErrorState, LoadingView } from '@/components/StateViews';
import { TypingIndicator } from '@/components/TypingIndicator';
import { useAuth } from '@/context/AuthContext';
import {
  useDeleteMessage,
  useEditMessage,
  useMessages,
  useSendMessage,
  useToggleReaction,
} from '@/hooks/useMessages';
import { useRoomPresence } from '@/hooks/usePresence';
import {
  useJoinRoom,
  useLeaveRoom,
  useMyRoomIds,
  useRoom,
  useRoomMembers,
} from '@/hooks/useRooms';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { colors, radius, spacing } from '@/theme';
import type { Message } from '@/types';
import { friendlyError } from '@/utils/errors';
import { shouldGroupWithPrevious } from '@/utils/messages';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '🎉'];

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const room = useRoom(id);
  const { data: myRoomIds } = useMyRoomIds();
  const isMember = myRoomIds?.has(id) ?? false;

  const messages = useMessages(id);
  const sendMessage = useSendMessage(id);
  const editMessage = useEditMessage(id);
  const deleteMessage = useDeleteMessage(id);
  const toggleReaction = useToggleReaction(id);
  const joinRoom = useJoinRoom();
  const leaveRoom = useLeaveRoom();
  const online = useRoomPresence(isMember ? id : undefined);
  const { typingUsernames, notifyTyping } = useTypingIndicator(isMember ? id : undefined);
  const { data: members } = useRoomMembers(id);

  const [text, setText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.data?.length)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.data?.length]);

  if (room.isLoading) return <LoadingView />;
  if (room.isError || !room.data)
    return <ErrorState message={friendlyError(room.error)} onRetry={room.refetch} />;

  function handleSend() {
    const body = text.trim();
    if (!body) return;
    setText('');

    if (editingMessageId) {
      editMessage.mutate(
        { id: editingMessageId, newBody: body },
        {
          onError: (e) => Alert.alert('Não foi possível editar', friendlyError(e)),
        },
      );
      setEditingMessageId(null);
    } else {
      sendMessage.mutate(body, {
        onError: (e) => Alert.alert('Não foi possível enviar', friendlyError(e)),
      });
    }
  }

  function handleReactionSelect(messageId: string, emoji: string) {
    const targetMsg = messages.data?.find((m) => m.id === messageId);
    const existingGroup = targetMsg?.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = Boolean(user && existingGroup?.userIds.includes(user.id));
    toggleReaction.mutate({ messageId, emoji, hasReacted });
  }

  function handleMessageOptions(message: Message) {
    const isMine = message.userId === user?.id;

    const options: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reagir...',
        onPress: () => {
          Alert.alert('Reações', 'Escolha um emoji para reagir:', [
            ...REACTION_EMOJIS.map((emoji) => ({
              text: emoji,
              onPress: () => handleReactionSelect(message.id, emoji),
            })),
            { text: 'Cancelar', style: 'cancel' as const },
          ]);
        },
      },
    ];

    if (isMine) {
      options.push({
        text: 'Editar',
        onPress: () => {
          setEditingMessageId(message.id);
          setText(message.body);
        },
      });
      options.push({
        text: 'Apagar',
        style: 'destructive',
        onPress: () => deleteMessage.mutate(message.id),
      });
    }

    Alert.alert('Opções da mensagem', undefined, options);
  }

  function confirmLeave() {
    Alert.alert('Sair da sala', `Deseja sair de "${room.data!.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => leaveRoom.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (!isMember) {
    return (
      <View style={styles.joinScreen}>
        <Stack.Screen options={{ title: room.data.name }} />
        <Text style={styles.joinEmoji}>{room.data.emoji}</Text>
        <Text style={styles.joinTitle}>{room.data.name}</Text>
        {room.data.description ? (
          <Text style={styles.joinDescription}>{room.data.description}</Text>
        ) : null}
        <Text style={styles.joinCount}>{room.data.memberCount ?? 0} participantes</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            joinRoom.mutate(id, {
              onError: (e) => Alert.alert('Não foi possível entrar', friendlyError(e)),
            })
          }
          style={styles.joinButton}
        >
          <Text style={styles.joinButtonText}>
            {joinRoom.isPending ? 'Entrando...' : 'Entrar na sala'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const onlineCount = online.length;
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: room.data.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={confirmLeave}>
              <Ionicons name="exit-outline" size={22} color={colors.danger} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.onlineBar}>
        <View style={styles.onlineDot} />
        <Text style={styles.onlineText}>
          {onlineCount} online{members?.length ? ` · ${members.length} na sala` : ''}
        </Text>
      </View>
      {messages.isLoading ? (
        <LoadingView />
      ) : (
        <FlatList
          ref={listRef}
          data={messages.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <MessageBubble
              message={item}
              mine={item.userId === user?.id}
              currentUserId={user?.id}
              showSender={!shouldGroupWithPrevious(item, messages.data?.[index - 1])}
              pending={item.id.startsWith('temp-')}
              onLongPress={() => handleMessageOptions(item)}
              onReactionPress={(emoji) => handleReactionSelect(item.id, emoji)}
            />
          )}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}
      <TypingIndicator usernames={typingUsernames} />
      {editingMessageId ? (
        <View style={styles.editingBanner}>
          <Text style={styles.editingText}>Editando mensagem...</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEditingMessageId(null);
              setText('');
            }}
          >
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (t.length > 0) notifyTyping();
          }}
          placeholder={
            editingMessageId ? 'Edite sua mensagem...' : 'Escreva uma mensagem'
          }
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editingMessageId ? 'Salvar edição' : 'Enviar'}
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendButton, !text.trim() && styles.sendDisabled]}
        >
          <Ionicons
            name={editingMessageId ? 'checkmark' : 'send'}
            size={18}
            color={colors.onPrimary}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  onlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online },
  onlineText: { fontSize: 12, color: colors.muted },
  list: { padding: spacing.md, gap: 2 },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editingText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  joinScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  joinEmoji: { fontSize: 56 },
  joinTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  joinDescription: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  joinCount: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  joinButtonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
});
