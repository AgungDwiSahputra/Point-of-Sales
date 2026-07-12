import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import { cacheProductsFromSupabase } from '../lib/productCache';
import { startSyncEngine } from '../lib/sync';
import { clearProfile, createProfile, loadProfile, profile, profileLoading, type Profile } from '../stores/profile';
import { session, sessionLoading, signInWithPassword, signOut, signUpWithPassword } from '../stores/session';
import Cart from './Cart';
import ProductCatalog from './ProductCatalog';
import TransactionHistory from './TransactionHistory';

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

  if (loadingSession) {
    return <p class="text-sm text-gray-500">Memuat sesi...</p>;
  }

  if (!currentSession) {
    return <LoginForm />;
  }

  if (loadingProfile) {
    return <p class="text-sm text-gray-500">Memuat profil toko...</p>;
  }

  if (!currentProfile) {
    return <ProfileSetupForm userId={currentSession.user.id} />;
  }

  return <AuthenticatedApp profile={currentProfile} />;
}

function AuthenticatedApp({ profile: currentProfile }: { profile: Profile }) {
  const [productCacheError, setProductCacheError] = useState<string | null>(null);
  const [view, setView] = useState<'kasir' | 'laporan'>('kasir');
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
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <p class="text-sm text-gray-500">Masuk sebagai</p>
          <p class="font-semibold">
            {currentProfile.store_name} ({currentProfile.role})
          </p>
        </div>
        <button type="button" onClick={() => signOut()} class="text-sm text-red-600 underline">
          Keluar
        </button>
      </div>
      {productCacheError && (
        <p class="text-sm text-red-600">Gagal memuat produk terbaru: {productCacheError}</p>
      )}

      {currentProfile.role === 'owner' && (
        <div class="flex gap-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setView('kasir')}
            class={`pb-2 text-sm ${view === 'kasir' ? 'border-b-2 border-blue-600 font-semibold text-blue-600' : 'text-gray-500'}`}
          >
            Kasir
          </button>
          <button
            type="button"
            onClick={() => setView('laporan')}
            class={`pb-2 text-sm ${view === 'laporan' ? 'border-b-2 border-blue-600 font-semibold text-blue-600' : 'text-gray-500'}`}
          >
            Riwayat &amp; Laporan
          </button>
        </div>
      )}

      {view === 'laporan' && currentProfile.role === 'owner' ? (
        <TransactionHistory userId={ownerId} />
      ) : (
        <main class="grid gap-6 sm:grid-cols-2 sm:items-start">
          <section>
            <h2 class="mb-3 text-xl font-bold">Katalog Produk</h2>
            <ProductCatalog profile={currentProfile} />
          </section>
          <section>
            <Cart profile={currentProfile} />
          </section>
        </main>
      )}
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
    <div class="mx-auto flex max-w-sm flex-col gap-3">
      <h1 class="text-xl font-bold">{mode === 'signin' ? 'Masuk ke POS' : 'Daftar Toko Baru'}</h1>
      <form
        class="flex flex-col gap-2"
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
        <input
          type="email"
          required
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          placeholder="Email toko Anda"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          placeholder="Password"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          class="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:bg-gray-300"
        >
          {submitting ? 'Memproses...' : mode === 'signin' ? 'Masuk' : 'Daftar'}
        </button>
        {error && <p class="text-sm text-red-600">{error}</p>}
        {info && <p class="text-sm text-green-600">{info}</p>}
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setInfo(null);
        }}
        class="text-sm text-gray-500 underline"
      >
        {mode === 'signin' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
      </button>
    </div>
  );
}

function ProfileSetupForm({ userId }: { userId: string }) {
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div class="mx-auto flex max-w-sm flex-col gap-3">
      <h1 class="text-xl font-bold">Lengkapi Profil Toko</h1>
      <form
        class="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSubmitting(true);
          try {
            await createProfile(userId, storeName);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan profil');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <input
          type="text"
          required
          value={storeName}
          onInput={(e) => setStoreName((e.target as HTMLInputElement).value)}
          placeholder="Nama toko"
          class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          class="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:bg-gray-300"
        >
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
        {error && <p class="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
