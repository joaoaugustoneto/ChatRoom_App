import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';
import { formatTypingIndicator } from '@/utils/typing';

export function TypingIndicator({ usernames }: { usernames: string[] }) {
  const text = formatTypingIndicator(usernames);

  if (!text) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingBottom: 4 },
  text: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
});
