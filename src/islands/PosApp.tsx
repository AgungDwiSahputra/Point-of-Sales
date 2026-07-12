import { useStore } from '@nanostores/preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { assetUrl } from '../lib/assetUrl';
import { cacheProductsFromSupabase } from '../lib/productCache';
import { startSyncEngine } from '../lib/sync';
import {
  clearProfile,
  createProfile,
  loadProfile,
  profile,
  profileLoading,
  updateProfile,
  type Profile,
} from '../stores/profile';
import { session, sessionLoading, signInWithPassword, signOut, signUpWithPassword } from '../stores/session';
import Cart from './Cart';
import { LogoutIcon, StoreIcon } from './icons';
import ProductCatalog from './ProductCatalog';
import TransactionHistory from './TransactionHistory';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10';

const primaryButtonClass =
  'w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-300';

export default function PosApp() {
  const currentSession = useStore(session);
  const loadingSession = useStore(sessionLoading);
  const currentProfile = useStore(profile);
  const loadingProfile = useStore(profileLoading);

  const userId = currentSession?.user.id ?? null;

  useEffect(() => {
    if (userId) {
      loadProfile(userId);
    } else {
      clearProfile();
    }
  }, [userId]);

  if (loadingSession || (currentSession && loadingProfile)) {
    return (
      <AuthShell>
        <div class="flex flex-col items-center gap-3 py-10">
          <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
          <p class="text-sm text-slate-500">Memuat...</p>
        </div>
      </AuthShell>
    );
  }

  if (!currentSession) {
    return <LoginForm />;
  }

  if (!currentProfile) {
    return <ProfileSetupForm userId={currentSession.user.id} />;
  }

  return <AuthenticatedApp profile={currentProfile} />;
}

function AuthShell({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 px-4 py-10">
      <img src={assetUrl('icons/logo-tittle.webp')} alt="Sahma.id — POS System" class="mb-8 h-12 w-auto sm:h-14" />
      <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card sm:p-8">{children}</div>
    </div>
  );
}

function AuthenticatedApp({ profile: currentProfile }: { profile: Profile }) {
  const [productCacheError, setProductCacheError] = useState<string | null>(null);
  const [view, setView] = useState<'kasir' | 'laporan'>('kasir');
  const [editingStore, setEditingStore] = useState(false);
  const ownerId =
    currentProfile.role === 'cashier' && currentProfile.owner_id ? currentProfile.owner_id : currentProfile.id;

  useEffect(() => {
    return startSyncEngine();
  }, []);

  useEffect(() => {
    const refreshProducts = async () => {
      const result = await cacheProductsFromSupabase(ownerId);
      setProductCacheError(result.error);
    };

    void refreshProducts();
    window.addEventListener('online', refreshProducts);
    return () => window.removeEventListener('online', refreshProducts);
  }, [ownerId]);

  return (
    <div class="min-h-screen bg-slate-50 pb-24 sm:pb-6">
      <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <img src={assetUrl('icons/logo-persegi.webp')} alt="" class="h-9 w-9 shrink-0 rounded-[10px]" />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold leading-tight text-slate-900">{currentProfile.store_name}</p>
              <span
                class={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  currentProfile.role === 'owner' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {currentProfile.role === 'owner' ? 'Pemilik' : 'Kasir'}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            {currentProfile.role === 'owner' && (
              <button
                type="button"
                onClick={() => setEditingStore((v) => !v)}
                class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
              >
                <StoreIcon class="h-4 w-4" />
                <span class="hidden sm:inline">Edit Toko</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogoutIcon class="h-4 w-4" />
              <span class="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {editingStore && (
          <div class="mx-auto max-w-5xl px-4 pb-3">
            <StoreSettingsForm profile={currentProfile} onDone={() => setEditingStore(false)} />
          </div>
        )}

        {currentProfile.role === 'owner' && (
          <div class="mx-auto max-w-5xl px-4 pb-3">
            <div class="inline-flex rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setView('kasir')}
                class={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  view === 'kasir' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                Kasir
              </button>
              <button
                type="button"
                onClick={() => setView('laporan')}
                class={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  view === 'laporan' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                Riwayat &amp; Laporan
              </button>
            </div>
          </div>
        )}
      </header>

      <div class="mx-auto max-w-5xl px-4 py-4">
        {productCacheError && (
          <div class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Gagal memuat produk terbaru: {productCacheError}
          </div>
        )}

        {view === 'laporan' && currentProfile.role === 'owner' ? (
          <TransactionHistory
            userId={ownerId}
            storeName={currentProfile.store_name}
            storeAddress={currentProfile.address}
          />
        ) : (
          <main class="grid gap-6 sm:grid-cols-2 sm:items-start">
            <section>
              <ProductCatalog profile={currentProfile} />
            </section>
            <section class="sm:sticky sm:top-32">
              <Cart profile={currentProfile} />
            </section>
          </main>
        )}
      </div>
    </div>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell>
      <h1 class="text-center text-lg font-semibold text-slate-900">
        {mode === 'signin' ? 'Masuk ke toko Anda' : 'Daftarkan toko baru'}
      </h1>
      <p class="mt-1 text-center text-sm text-slate-500">
        {mode === 'signin' ? 'Kelola penjualan Anda di mana saja.' : 'Mulai kelola penjualan dalam hitungan menit.'}
      </p>

      <form
        class="mt-6 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setInfo(null);
          setSubmitting(true);

          if (mode === 'signin') {
            const message = await signInWithPassword(email, password);
            setSubmitting(false);
            if (message) setError(message);
            return;
          }

          const result = await signUpWithPassword(email, password);
          setSubmitting(false);
          if (result.error) {
            setError(result.error);
          } else if (result.alreadyRegistered) {
            setError('Email ini sudah terdaftar. Silakan masuk, atau gunakan email lain.');
          } else {
            setInfo('Akun dibuat. Silakan masuk.');
            setMode('signin');
          }
        }}
      >
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            placeholder="nama@tokoanda.com"
            class={inputClass}
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-600">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            placeholder="Minimal 6 karakter"
            class={inputClass}
          />
        </label>

        <button type="submit" disabled={submitting} class={`${primaryButtonClass} mt-2`}>
          {submitting ? 'Memproses...' : mode === 'signin' ? 'Masuk' : 'Daftar'}
        </button>

        {error && (
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {info && <p class="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{info}</p>}
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setInfo(null);
        }}
        class="mt-5 w-full text-center text-sm text-slate-500 transition hover:text-brand-600"
      >
        {mode === 'signin' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
        <span class="font-semibold text-brand-600">{mode === 'signin' ? 'Daftar' : 'Masuk'}</span>
      </button>
    </AuthShell>
  );
}

function ProfileSetupForm({ userId }: { userId: string }) {
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AuthShell>
      <h1 class="text-center text-lg font-semibold text-slate-900">Lengkapi profil toko</h1>
      <p class="mt-1 text-center text-sm text-slate-500">Satu langkah lagi sebelum Anda mulai berjualan.</p>

      <form
        class="mt-6 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSubmitting(true);
          try {
            await createProfile(userId, storeName, address);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan profil');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-600">Nama toko</span>
          <input
            type="text"
            required
            value={storeName}
            onInput={(e) => setStoreName((e.target as HTMLInputElement).value)}
            placeholder="mis. Toko Berkah Jaya"
            class={inputClass}
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-slate-600">Alamat toko (opsional, tampil di struk)</span>
          <input
            type="text"
            value={address}
            onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
            placeholder="mis. Jl. Merdeka No. 10, Bandung"
            class={inputClass}
          />
        </label>

        <button type="submit" disabled={submitting} class={`${primaryButtonClass} mt-2`}>
          {submitting ? 'Menyimpan...' : 'Simpan & Mulai'}
        </button>
        {error && (
          <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>
    </AuthShell>
  );
}

function StoreSettingsForm({ profile: currentProfile, onDone }: { profile: Profile; onDone: () => void }) {
  const [storeName, setStoreName] = useState(currentProfile.store_name);
  const [address, setAddress] = useState(currentProfile.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      class="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
          await updateProfile(currentProfile.id, { store_name: storeName, address });
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Gagal menyimpan profil');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h3 class="text-sm font-semibold text-slate-900">Pengaturan Toko</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-600">Nama toko</span>
          <input
            required
            value={storeName}
            onInput={(e) => setStoreName((e.target as HTMLInputElement).value)}
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-600">Alamat toko (tampil di struk)</span>
          <input
            value={address}
            onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
            placeholder="mis. Jl. Merdeka No. 10, Bandung"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </label>
      </div>
      {error && <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div class="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          class="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:bg-slate-300 sm:flex-none sm:px-6"
        >
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button
          type="button"
          onClick={onDone}
          class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
