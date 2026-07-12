import Fuse from 'fuse.js';
import type { LocalProduct } from './db';

let cachedProducts: LocalProduct[] | null = null;
let cachedFuse: Fuse<LocalProduct> | null = null;

function getFuse(products: LocalProduct[]): Fuse<LocalProduct> {
  if (cachedFuse && cachedProducts === products) return cachedFuse;

  cachedFuse = new Fuse(products, {
    keys: ['name', 'sku'],
    threshold: 0.35,
    ignoreLocation: true,
  });
  cachedProducts = products;
  return cachedFuse;
}

// Pencarian in-memory terhadap cache Dexie (F02) — bukan Pagefind, bukan panggilan ke Supabase per keystroke.
export function searchProducts(products: LocalProduct[], query: string): LocalProduct[] {
  if (!query.trim()) return products;
  return getFuse(products)
    .search(query)
    .map((result) => result.item);
}
