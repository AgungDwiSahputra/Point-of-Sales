import { useMemo, useState } from 'preact/hooks';
import type { LocalProduct } from '../lib/db';
import { setProductActive } from '../lib/productManagement';
import { searchProducts } from '../lib/search';
import { useProducts } from '../lib/useProducts';
import { addToCart } from '../stores/cart';
import type { Profile } from '../stores/profile';
import ProductForm from './ProductForm';
import { PlusIcon, SearchIcon, ShoppingBagIcon } from './icons';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const AVATAR_TINTS = [
  'bg-brand-500',
  'bg-accent-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
];

function avatarTint(name: string): string {
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export default function ProductCatalog({ profile }: { profile: Profile }) {
  const products = useProducts();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LocalProduct | 'new' | null>(null);

  const ownerId = profile.role === 'cashier' && profile.owner_id ? profile.owner_id : profile.id;
  const canManage = profile.role === 'owner'; // F08: cashier tidak boleh mengubah harga/stok produk

  // Cashier tidak boleh melihat/menjual produk yang sudah dinonaktifkan owner; owner tetap perlu
  // melihatnya di sini supaya bisa mengaktifkan kembali.
  const visibleProducts = useMemo(
    () => (canManage ? products : products.filter((p) => p.is_active)),
    [products, canManage]
  );
  const results = useMemo(() => searchProducts(visibleProducts, query), [visibleProducts, query]);

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <SearchIcon class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            placeholder="Cari produk (nama/SKU)..."
            class="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
        {canManage && editing !== 'new' && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            class="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800"
          >
            <PlusIcon class="h-4 w-4" />
            <span class="hidden sm:inline">Produk</span>
          </button>
        )}
      </div>

      {canManage && editing === 'new' && (
        <ProductForm userId={ownerId} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
      )}

      {visibleProducts.length === 0 ? (
        <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <ShoppingBagIcon class="h-8 w-8 text-slate-300" />
          <p class="text-sm text-slate-500">Belum ada produk di katalog.</p>
        </div>
      ) : results.length === 0 ? (
        <p class="py-6 text-center text-sm text-slate-500">Produk tidak ditemukan.</p>
      ) : (
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {results.map((product) =>
            canManage && editing !== 'new' && editing?.id === product.id ? (
              <li key={product.id} class="col-span-2 sm:col-span-3">
                <ProductForm
                  userId={ownerId}
                  product={product}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={product.id}
                class={`flex flex-col rounded-2xl border border-slate-100 bg-white p-3 shadow-card transition hover:shadow-card-hover ${
                  !product.is_active ? 'opacity-50' : ''
                }`}
              >
                <div class="flex items-start gap-2">
                  <div
                    class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${avatarTint(product.name)}`}
                  >
                    {product.name.charAt(0).toUpperCase()}
                  </div>
                  {!product.is_active && (
                    <span class="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Nonaktif
                    </span>
                  )}
                </div>

                <p class="mt-2 line-clamp-2 text-sm font-medium leading-snug text-slate-900">{product.name}</p>
                <p class="mt-0.5 text-sm font-semibold text-brand-600">{currency.format(product.price)}</p>
                <p class="text-xs text-slate-500">Stok: {product.stock}</p>

                <button
                  type="button"
                  disabled={product.stock <= 0 || !product.is_active}
                  onClick={() =>
                    addToCart({
                      product_id: product.id,
                      name: product.name,
                      price: product.price,
                      stock: product.stock,
                    })
                  }
                  class="mt-2.5 flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <PlusIcon class="h-3.5 w-3.5" />
                  Tambah
                </button>
                {canManage && (
                  <div class="mt-1.5 flex gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      class="flex-1 rounded-lg border border-slate-200 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductActive(ownerId, product.id, !product.is_active)}
                      class="flex-1 rounded-lg border border-slate-200 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      {product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
