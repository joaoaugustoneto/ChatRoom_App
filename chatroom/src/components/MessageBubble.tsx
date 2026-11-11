import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { colors, radius, spacing } from '@/theme';
import type { Message } from '@/types';
import { formatMessageTime } from '@/utils/messages';

interface MessageBubbleProps {
  message: Message;
  mine: boolean;
  showSender: boolean;
  currentUserId?: string;
  pending?: boolean;
  onLongPress?: () => void;
  onReactionPress?: (emoji: string) => void;
}

export function MessageBubble({
  message,
  mine,
  showSender,
  currentUserId,
  pending,
  onLongPress,
  onReactionPress,
}: MessageBubbleProps) {
  const isRead = Boolean(message.readByCount && message.readByCount > 0);

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      {!mine &&
        (showSender ? (
          <Avatar username={message.username} color={message.avatarColor} size={28} />
        ) : (
          <View style={styles.avatarGap} />
        ))}
      <View style={styles.column}>
        {!mine && showSender ? (
          <Text style={styles.sender}>{message.username}</Text>
        ) : null}
        <Pressable
          onLongPress={onLongPress}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            pending && styles.pending,
          ]}
        >
          <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
        </Pressable>

        {message.reactions && message.reactions.length > 0 ? (
          <View style={[styles.reactionsRow, mine && styles.reactionsRowMine]}>
            {message.reactions.map((r) => {
              const reacted = Boolean(currentUserId && r.userIds.includes(currentUserId));
              return (
                <Pressable
                  key={r.emoji}
                  accessibilityRole="button"
                  onPress={() => onReactionPress?.(r.emoji)}
                  style={[styles.reactionChip, reacted && styles.reactionChipActive]}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text
                    style={[styles.reactionCount, reacted && styles.reactionCountActive]}
                  >
                    {r.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.timeRow, mine && styles.timeRowMine]}>
          <Text style={[styles.time, mine && styles.timeMine]}>
            {pending
              ? 'enviando...'
              : `${formatMessageTime(message.createdAt)}${message.isEdited ? ' (editado)' : ''}`}
          </Text>
          {mine && !pending ? (
            <Ionicons
              name={isRead ? 'checkmark-done' : 'checkmark'}
              size={13}
              color={isRead ? '#93C5FD' : colors.onPrimary}
              style={styles.checkIcon}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: 4,
    maxWidth: '85%',
  },
  rowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarGap: { width: 28 },
  column: { flexShrink: 1 },
  sender: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  bubbleMine: {
    backgroundColor: colors.bubbleMine,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.bubbleTheirs,
    borderBottomLeftRadius: 4,
  },
  pending: { opacity: 0.6 },
  body: { fontSize: 15, color: colors.text, lineHeight: 20 },
  bodyMine: { color: colors.onPrimary },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    marginLeft: 4,
  },
  timeRowMine: {
    justifyContent: 'flex-end',
    marginRight: 4,
  },
  time: { fontSize: 10, color: colors.muted },
  timeMine: { textAlign: 'right', color: colors.muted },
  checkIcon: { opacity: 0.9 },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionsRowMine: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, fontWeight: '700', color: colors.muted },
  reactionCountActive: { color: colors.primary },
});
