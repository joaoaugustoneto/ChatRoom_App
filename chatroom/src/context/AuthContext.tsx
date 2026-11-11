import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) queryClient.clear(); // não vazar dados entre contas
    });

    // Trata links de confirmação de e-mail e autenticação profunda
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const code = parsed.queryParams?.code;
        if (typeof code === 'string') {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (err) {
        console.warn('Erro ao processar callback de autenticação:', err);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));

    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (name, email, password) => {
        let emailRedirectTo: string | undefined;
        try {
          if (
            Platform.OS === 'web' &&
            typeof window !== 'undefined' &&
            window.location?.origin
          ) {
            emailRedirectTo = window.location.origin;
          } else {
            emailRedirectTo = Linking.createURL('/');
          }
        } catch {
          // ignore
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, username: name },
            emailRedirectTo,
          },
        });
        if (error) throw error;
        return { needsConfirmation: data.session === null };
      },
      signOut: async () => {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn('Erro ao chamar signOut no servidor:', err);
        } finally {
          setSession(null);
          queryClient.clear();
        }
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return context;
}
