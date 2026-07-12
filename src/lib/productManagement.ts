import { cacheProductsFromSupabase } from './productCache';
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

// RLS "insert_own_products"/"update_own_products" mensyaratkan auth.uid() = user_id, jadi hanya
// owner yang bisa berhasil - cashier akan mendapat error dari Supabase kalau nekat mencoba (F08).
export async function createProduct(userId: string, input: ProductInput): Promise<ProductActionResult> {
  const { error } = await supabase.from('products').insert({
    user_id: userId,
    name: input.name,
    price: input.price,
    sku: input.sku || null,
    stock: input.stock,
  });

  if (error) return { ok: false, error: error.message };

  await cacheProductsFromSupabase(userId);
  return { ok: true };
}

// Soft-delete: skema PRD sudah menyediakan kolom is_active justru untuk ini, bukan DELETE sungguhan -
// produk yang pernah terjual tidak boleh hilang begitu saja karena masih dirujuk riwayat transaksi.
export async function setProductActive(
  userId: string,
  productId: string,
  isActive: boolean
): Promise<ProductActionResult> {
  const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', productId);

  if (error) return { ok: false, error: error.message };

  await cacheProductsFromSupabase(userId);
  return { ok: true };
}

export async function updateProduct(
  userId: string,
  productId: string,
  input: ProductInput
): Promise<ProductActionResult> {
  const { error } = await supabase
    .from('products')
    .update({
      name: input.name,
      price: input.price,
      sku: input.sku || null,
      stock: input.stock,
    })
    .eq('id', productId);

  if (error) return { ok: false, error: error.message };

  await cacheProductsFromSupabase(userId);
  return { ok: true };
}
