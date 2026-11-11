import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble } from '@/components/MessageBubble';
import { ErrorState, LoadingView } from '@/components/StateViews';
import { TypingIndicator } from '@/components/TypingIndicator';
import { useAuth } from '@/context/AuthContext';
import {
  useDeleteMessage,
  useEditMessage,
  useMarkMessagesAsRead,
  useMessages,
  useSendMessage,
  useToggleReaction,
} from '@/hooks/useMessages';
import { useRoomPresence } from '@/hooks/usePresence';
import {
  useGetOrCreateDirectRoom,
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
import { filterMessages } from '@/utils/search';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '🎉'];

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
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
  const markAsRead = useMarkMessagesAsRead(id);
  const joinRoom = useJoinRoom();
  const leaveRoom = useLeaveRoom();
  const createDirectRoom = useGetOrCreateDirectRoom();
  const online = useRoomPresence(isMember ? id : undefined);
  const { typingUsernames, notifyTyping } = useTypingIndicator(isMember ? id : undefined);
  const { data: members } = useRoomMembers(id);

  const [text, setText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const displayedMessages = useMemo(() => {
    const list = messages.data ?? [];
    if (!searchOpen || !searchQuery.trim()) return list;
    return filterMessages(list, searchQuery);
  }, [messages.data, searchOpen, searchQuery]);

  useEffect(() => {
    if (displayedMessages.length && !searchOpen)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [displayedMessages.length, searchOpen]);

  useEffect(() => {
    if (messages.data?.length && user && isMember) {
      const unreadIds = messages.data
        .filter((m) => m.userId !== user.id && !m.id.startsWith('temp-'))
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        markAsRead.mutate(unreadIds);
      }
    }
  }, [messages.data?.length, user?.id, isMember]);

  if (room.isLoading) return <LoadingView />;
  if (room.isError || !room.data)
    return <ErrorState message={friendlyError(room.error)} onRetry={room.refetch} />;

  function handleSend() {
    const body = text.trim();
    if (!body && !attachedImage) return;
    setText('');
    const imgToSend = attachedImage;
    setAttachedImage(null);

    if (editingMessageId) {
      editMessage.mutate(
        { id: editingMessageId, newBody: body },
        {
          onError: (e) => {
            const msg = friendlyError(e);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.alert('Não foi possível editar: ' + msg);
            } else {
              Alert.alert('Não foi possível editar', msg);
            }
          },
        },
      );
      setEditingMessageId(null);
    } else {
      sendMessage.mutate(
        { body: body || '📷 Imagem', imageUrl: imgToSend || undefined },
        {
          onError: (e) => {
            const msg = friendlyError(e);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.alert('Não foi possível enviar: ' + msg);
            } else {
              Alert.alert('Não foi possível enviar', msg);
            }
          },
        },
      );
    }
  }

  function handleAttachImage() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = window.prompt(
        'Cole a URL de uma imagem para anexar (ou confirme para usar exemplo):',
        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500',
      );
      if (url) {
        setAttachedImage(url);
      }
      return;
    }

    Alert.alert('Anexar Imagem', 'Selecione uma imagem para enviar:', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Imagem de Exemplo',
        onPress: () =>
          setAttachedImage(
            'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=500',
          ),
      },
    ]);
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
    } else {
      options.push({
        text: `Conversar no privado com ${message.username}`,
        onPress: () => {
          createDirectRoom.mutate(message.userId, {
            onSuccess: (dmRoomId) => {
              router.push(`/room/${dmRoomId}`);
            },
            onError: (err) => Alert.alert('Erro', friendlyError(err)),
          });
        },
      });
    }

    Alert.alert('Opções da mensagem', undefined, options);
  }

  function confirmLeave() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Deseja sair de "${room.data!.name}"?`)) {
        leaveRoom.mutate(id, { onSuccess: () => router.back() });
      }
      return;
    }

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
        <View style={styles.joinMetaRow}>
          <Text style={styles.joinCount}>{room.data.memberCount ?? 0} participantes</Text>
          {room.data.isPrivate ? (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={13} color={colors.primary} />
              <Text style={styles.privateBadgeText}>Sala Privada</Text>
            </View>
          ) : null}
        </View>

        {room.data.isPrivate ? (
          <View style={styles.inviteInputBox}>
            <Text style={styles.inviteLabel}>Código de Convite:</Text>
            <TextInput
              value={enteredCode}
              onChangeText={setEnteredCode}
              placeholder="Digite o código"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              style={styles.inviteInput}
            />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            joinRoom.mutate(
              { roomId: id, inviteCode: room.data.isPrivate ? enteredCode : undefined },
              {
                onError: (e) => {
                  const msg = friendlyError(e);
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.alert('Não foi possível entrar: ' + msg);
                  } else {
                    Alert.alert('Não foi possível entrar', msg);
                  }
                },
              },
            )
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
            <View style={styles.headerRight}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Buscar mensagens"
                onPress={() => setSearchOpen((prev) => !prev)}
                style={styles.headerBtn}
              >
                <Ionicons
                  name={searchOpen ? 'search' : 'search-outline'}
                  size={22}
                  color={colors.primary}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sair da sala"
                onPress={confirmLeave}
                style={styles.headerBtn}
              >
                <Ionicons name="exit-outline" size={22} color={colors.danger} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={styles.onlineBar}>
        <View style={styles.onlineDot} />
        <Text style={styles.onlineText}>
          {onlineCount} online{members?.length ? ` · ${members.length} na sala` : ''}
        </Text>
        {room.data.isPrivate && room.data.inviteCode ? (
          <View style={styles.inviteCodeBadge}>
            <Ionicons name="key-outline" size={12} color={colors.primary} />
            <Text style={styles.inviteCodeText}>Convite: {room.data.inviteCode}</Text>
          </View>
        ) : null}
      </View>

      {searchOpen ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por texto ou autor..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoFocus
          />
          {searchQuery ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {messages.isLoading ? (
        <LoadingView />
      ) : (
        <FlatList
          ref={listRef}
          data={displayedMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <MessageBubble
              message={item}
              mine={item.userId === user?.id}
              currentUserId={user?.id}
              showSender={!shouldGroupWithPrevious(item, displayedMessages[index - 1])}
              pending={item.id.startsWith('temp-')}
              onLongPress={() => handleMessageOptions(item)}
              onReactionPress={(emoji) => handleReactionSelect(item.id, emoji)}
            />
          )}
          onContentSizeChange={() => {
            if (!searchOpen) listRef.current?.scrollToEnd({ animated: false });
          }}
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
      {attachedImage ? (
        <View style={styles.imagePreviewRow}>
          <Image source={{ uri: attachedImage }} style={styles.imagePreviewThumb} />
          <Text style={styles.imagePreviewText}>Imagem selecionada</Text>
          <Pressable onPress={() => setAttachedImage(null)}>
            <Ionicons name="close-circle" size={20} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anexar imagem"
          onPress={handleAttachImage}
          style={styles.attachBtn}
        >
          <Ionicons name="image-outline" size={24} color={colors.primary} />
        </Pressable>
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
          onSubmitEditing={handleSend}
          returnKeyType="send"
          onKeyPress={(e) => {
            if (
              Platform.OS === 'web' &&
              'key' in e.nativeEvent &&
              e.nativeEvent.key === 'Enter' &&
              !('shiftKey' in e.nativeEvent && e.nativeEvent.shiftKey)
            ) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={editingMessageId ? 'Salvar edição' : 'Enviar'}
          onPress={handleSend}
          disabled={!text.trim() && !attachedImage}
          style={[
            styles.sendButton,
            !text.trim() && !attachedImage && styles.sendDisabled,
          ]}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBtn: {
    padding: 4,
  },
  onlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online },
  onlineText: { fontSize: 12, color: colors.muted },
  inviteCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 'auto',
  },
  inviteCodeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  clearBtn: {
    padding: 2,
  },
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
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  imagePreviewThumb: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  imagePreviewText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
  },
  attachBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
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
  joinMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  joinCount: { fontSize: 13, color: colors.muted },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  privateBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  inviteInputBox: {
    width: '100%',
    marginBottom: spacing.md,
  },
  inviteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  inviteInput: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '700',
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  joinButtonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
});
