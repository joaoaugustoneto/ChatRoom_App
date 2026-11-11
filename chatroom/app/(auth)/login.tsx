import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { loginSchema } from '@/schemas/auth';
import type { LoginFormData } from '@/schemas/auth';
import { colors, spacing } from '@/theme';
import { friendlyError } from '@/utils/errors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      // Com sessão, o guarda de rota redireciona sozinho.
    } catch (error) {
      setFormError(friendlyError(error));
    }
  });

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Ionicons name="chatbubbles" size={56} color={colors.primary} />
        <Text style={styles.title}>ChatRoom</Text>
        <Text style={styles.subtitle}>Converse em tempo real, em salas</Text>
      </View>
      <FormInput
        control={control}
        name="email"
        label="E-mail"
        placeholder="voce@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <FormInput
        control={control}
        name="password"
        label="Senha"
        placeholder="Sua senha"
        secureTextEntry
        autoComplete="password"
      />
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <Button title="Entrar" onPress={submit} loading={formState.isSubmitting} />
      <Link href="/register" style={styles.link}>
        Não tem conta? <Text style={styles.linkStrong}>Cadastre-se</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 4 },
  error: { color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
  link: { marginTop: spacing.lg, textAlign: 'center', color: colors.muted, fontSize: 15 },
  linkStrong: { color: colors.primary, fontWeight: '700' },
});
