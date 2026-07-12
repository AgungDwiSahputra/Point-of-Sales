import { atom } from 'nanostores';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  store_name: string;
  address: string | null;
  role: 'owner' | 'cashier';
  owner_id: string | null;
}

export const profile = atom<Profile | null>(null);
export const profileLoading = atom(false);

export async function loadProfile(userId: string): Promise<void> {
  profileLoading.set(true);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, store_name, address, role, owner_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) console.error('Gagal memuat profil toko:', error);
  profile.set(data ?? null);
  profileLoading.set(false);
}

export async function createProfile(userId: string, storeName: string, address?: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, store_name: storeName, address: address || null, role: 'owner' });
  if (error) throw error;
  await loadProfile(userId);
}

export async function updateProfile(userId: string, input: { store_name: string; address?: string }): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ store_name: input.store_name, address: input.address || null })
    .eq('id', userId);
  if (error) throw error;
  await loadProfile(userId);
}

export function clearProfile(): void {
  profile.set(null);
}
