import { db, type LocalProduct } from './db';
import { supabase } from './supabase';

export interface ProductInput {
  name: string;
  price: number;
  sku?: string;
  stock: number;
}

export interface ProductActionResult {
  ok: boolean;
  error?: string;
}

// Postgres numeric datang sebagai string lewat PostgREST - paksa ke integer rupiah (sama seperti productCache.ts).
function toLocalProduct(row: {
  id: string;
  user_id: string;
  name: string;
  price: number | string;
  sku: string | null;
  stock: number;
  is_active: boolean;
  updated_at: string;
}): LocalProduct {
  return { ...row, sku: row.sku ?? undefined, price: Math.round(Number(row.price)) };
}

// RLS "insert_own_products"/"update_own_products" mensyaratkan auth.uid() = user_id, jadi hanya
// owner yang bisa berhasil - cashier akan mendapat error dari Supabase kalau nekat mencoba (F08).
//
// Ambil baris yang baru dibuat langsung dari respons INSERT (.select().single()) lalu simpan HANYA
// baris itu ke cache lokal - bukan panggil cacheProductsFromSupabase() yang SELECT ULANG seluruh
// katalog (round-trip jaringan kedua yang tidak perlu, itu penyebab delay saat tambah/edit produk).
export async function createProduct(userId: string, input: ProductInput): Promise<ProductActionResult> {
  const { data, error } = await supabase
    .from('products')
    .insert({ user_id: userId, name: input.name, price: input.price, sku: input.sku || null, stock: input.stock })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  await db.products.put(toLocalProduct(data));
  return { ok: true };
}

// Soft-delete: skema PRD sudah menyediakan kolom is_active justru untuk ini, bukan DELETE sungguhan -
// produk yang pernah terjual tidak boleh hilang begitu saja karena masih dirujuk riwayat transaksi.
export async function setProductActive(productId: string, isActive: boolean): Promise<ProductActionResult> {
  const { data, error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', productId)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  await db.products.put(toLocalProduct(data));
  return { ok: true };
}

export async function updateProduct(productId: string, input: ProductInput): Promise<ProductActionResult> {
  const { data, error } = await supabase
    .from('products')
    .update({ name: input.name, price: input.price, sku: input.sku || null, stock: input.stock })
    .eq('id', productId)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  await db.products.put(toLocalProduct(data));
  return { ok: true };
}
