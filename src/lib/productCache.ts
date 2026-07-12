import { db, type LocalProduct } from './db';
import { supabase } from './supabase';

export interface ProductCacheResult {
  error: string | null;
}

// F02: "Produk di-cache penuh ke Dexie.js saat login/online" - full refresh, bukan merge/diff.
// Dibatasi ke baris milik userId ini saja (bukan clear seluruh tabel), untuk berjaga-jaga kalau
// satu device dipakai bergantian oleh lebih dari satu akun toko.
export async function cacheProductsFromSupabase(userId: string): Promise<ProductCacheResult> {
  const { data, error } = await supabase
    .from('products')
    .select('id, user_id, name, price, sku, stock, is_active, updated_at')
    .eq('user_id', userId);

  if (error) return { error: error.message };

  // Postgres numeric datang sebagai string lewat PostgREST (menghindari presisi float) -
  // paksa ke integer rupiah sesuai konvensi lokal kita.
  const products: LocalProduct[] = data.map((p) => ({ ...p, price: Math.round(Number(p.price)) }));

  await db.transaction('rw', db.products, async () => {
    await db.products.where('user_id').equals(userId).delete();
    if (products.length > 0) await db.products.bulkAdd(products);
  });

  return { error: null };
}
