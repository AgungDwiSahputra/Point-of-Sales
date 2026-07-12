import { useMemo, useState } from 'preact/hooks';
import type { LocalProduct } from '../lib/db';
import { setProductActive } from '../lib/productManagement';
import { searchProducts } from '../lib/search';
import { useProducts } from '../lib/useProducts';
import { addToCart } from '../stores/cart';
import type { Profile } from '../stores/profile';
import ProductForm from './ProductForm';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

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
      <input
        type="search"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        placeholder="Cari produk (nama/SKU)..."
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />

      {canManage &&
        (editing === 'new' ? (
          <ProductForm userId={ownerId} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            class="rounded-md border border-blue-600 px-3 py-1 text-sm text-blue-600"
          >
            + Tambah Produk
          </button>
        ))}

      {visibleProducts.length === 0 ? (
        <p class="text-sm text-gray-500">Belum ada produk di cache lokal.</p>
      ) : results.length === 0 ? (
        <p class="text-sm text-gray-500">Produk tidak ditemukan.</p>
      ) : (
        <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                class={`rounded-lg border p-3 ${product.is_active ? 'border-gray-200' : 'border-gray-200 bg-gray-100 opacity-60'}`}
              >
                <p class="font-medium">{product.name}</p>
                <p class="text-sm text-gray-500">{currency.format(product.price)}</p>
                <p class="text-xs text-gray-400">Stok: {product.stock}</p>
                {!product.is_active && <p class="text-xs font-medium text-gray-500">Nonaktif</p>}
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
                  class="mt-2 w-full rounded-md bg-blue-600 px-2 py-1 text-sm text-white disabled:bg-gray-300"
                >
                  Tambah
                </button>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      class="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductActive(ownerId, product.id, !product.is_active)}
                      class="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      {product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
