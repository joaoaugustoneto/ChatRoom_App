import { StyleSheet, Text, View } from 'react-native';
import { initials } from '@/utils/avatar';

interface AvatarProps {
  username: string;
  color: string;
  size?: number;
}

export function Avatar({ username, color, size = 36 }: AvatarProps) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(username)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800' },
});
