import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { db, type LocalProduct } from './db';

// Live-reactive read dari cache Dexie lokal — bukan query ke Supabase per render.
export function useProducts(): LocalProduct[] {
  const [products, setProducts] = useState<LocalProduct[]>([]);

  useEffect(() => {
    const subscription = liveQuery(() => db.products.toArray()).subscribe({
      next: setProducts,
      error: (err) => console.error('Gagal memuat produk dari Dexie:', err),
    });
    return () => subscription.unsubscribe();
  }, []);

  return products;
}
