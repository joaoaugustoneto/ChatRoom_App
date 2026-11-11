import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';
import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { Screen } from '@/components/Screen';
import { useCreateRoom } from '@/hooks/useRooms';
import { colors, radius, spacing } from '@/theme';
import { friendlyError } from '@/utils/errors';

const schema = z.object({
  name: z.string().trim().min(2, 'Dê um nome à sala').max(60, 'Máximo de 60 caracteres'),
  description: z.string().trim().max(120, 'Máximo de 120 caracteres'),
});

type FormData = z.infer<typeof schema>;

const EMOJIS = ['💬', '🚀', '🎮', '📚', '☕', '🎵', '💡', '🔥', '🌍', '⚡'];

export default function NewRoomScreen() {
  const router = useRouter();
  const createRoom = useCreateRoom();
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });

  const submit = handleSubmit((values) => {
    setFormError(null);
    createRoom.mutate(
      {
        name: values.name,
        description: values.description,
        emoji,
        isPrivate,
        inviteCode: isPrivate ? inviteCode : undefined,
      },
      {
        onSuccess: (id) => router.replace(`/room/${id}`),
        onError: (e) => {
          const msg = friendlyError(e);
          setFormError(msg);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert('Não foi possível criar a sala: ' + msg);
          } else {
            Alert.alert('Não foi possível criar a sala', msg);
          }
        },
      },
    );
  });

  return (
    <Screen scroll>
      <Text style={styles.label}>Ícone da sala</Text>
      <View style={styles.emojiRow}>
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityState={{ selected: e === emoji }}
            onPress={() => setEmoji(e)}
            style={[styles.emojiOption, e === emoji && styles.emojiSelected]}
          >
            <Text style={styles.emojiText}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <FormInput
        control={control}
        name="name"
        label="Nome da sala"
        placeholder="Ex.: Fãs de React Native"
      />
      <FormInput
        control={control}
        name="description"
        label="Descrição (opcional)"
        placeholder="Do que essa sala trata?"
      />

      <View style={styles.privateRow}>
        <View style={styles.privateInfo}>
          <Text style={styles.privateTitle}>Sala privada por convite</Text>
          <Text style={styles.privateDesc}>
            Exige código de acesso para novos membros entrarem
          </Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>

      {isPrivate ? (
        <View style={styles.inviteFieldWrap}>
          <Text style={styles.label}>Código de convite (opcional)</Text>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Ex.: REACT26 (gerado automaticamente se vazio)"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            style={styles.inviteInput}
          />
        </View>
      ) : null}

      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

      <Button
        title="Criar sala"
        onPress={submit}
        loading={formState.isSubmitting || createRoom.isPending}
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  emojiText: { fontSize: 22 },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  privateInfo: { flex: 1, marginRight: spacing.md },
  privateTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  privateDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  inviteFieldWrap: { marginBottom: spacing.md },
  inviteInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: spacing.sm,
    textAlign: 'center',
    fontWeight: '500',
  },
});
