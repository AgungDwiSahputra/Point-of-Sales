import type { Session } from '@supabase/supabase-js';
import { atom } from 'nanostores';
import { supabase } from '../lib/supabase';

export const session = atom<Session | null>(null);
export const sessionLoading = atom(true);

supabase.auth.getSession().then(({ data }) => {
  session.set(data.session);
  sessionLoading.set(false);
});

supabase.auth.onAuthStateChange((_event, newSession) => {
  session.set(newSession);
  sessionLoading.set(false);
});

export interface SignUpResult {
  error: string | null;
  // Supabase tidak mengembalikan error untuk email yang sudah terdaftar (mencegah user enumeration).
  // `identities` kosong pada respons signUp adalah satu-satunya penanda kasus ini.
  alreadyRegistered: boolean;
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message, alreadyRegistered: false };
  return { error: null, alreadyRegistered: (data.user?.identities?.length ?? 0) === 0 };
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
