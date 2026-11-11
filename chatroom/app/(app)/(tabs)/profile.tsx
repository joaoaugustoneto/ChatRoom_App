import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { useMyProfile, useUpdateUsername } from '@/hooks/useMyProfile';
import { colors, spacing } from '@/theme';
import { friendlyError } from '@/utils/errors';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const updateUsername = useUpdateUsername();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  function startEditing() {
    setName(profile?.username ?? '');
    setEditing(true);
  }

  function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert('Nome muito curto', 'Use pelo menos 2 caracteres.');
      return;
    }
    updateUsername.mutate(trimmed, {
      onSuccess: () => setEditing(false),
      onError: (e) => Alert.alert('Não foi possível salvar', friendlyError(e)),
    });
  }

  function confirmSignOut() {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => signOut().catch((e) => Alert.alert('Erro', friendlyError(e))),
      },
    ]);
  }

  return (
    <Screen scroll>
      <Text style={styles.title}>Perfil</Text>
      <Card style={styles.card}>
        {profile ? (
          <Avatar username={profile.username} color={profile.avatarColor} size={72} />
        ) : null}
        {editing ? (
          <View style={styles.editRow}>
            <Input
              label="Nome exibido no chat"
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <View style={styles.editButtons}>
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => setEditing(false)}
                style={styles.editButton}
              />
              <Button
                title="Salvar"
                onPress={save}
                loading={updateUsername.isPending}
                style={styles.editButton}
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.name}>{profile?.username}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <Button title="Editar nome" variant="ghost" onPress={startEditing} />
          </>
        )}
      </Card>
      <Button
        title="Sair da conta"
        variant="danger"
        onPress={confirmSignOut}
        style={styles.signOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: { alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  email: { fontSize: 14, color: colors.muted },
  editRow: { alignSelf: 'stretch' },
  editButtons: { flexDirection: 'row', gap: spacing.sm },
  editButton: { flex: 1 },
  signOut: { marginTop: spacing.lg },
});
