import { useState } from 'preact/hooks';
import type { LocalProduct } from '../lib/db';
import { createProduct, updateProduct } from '../lib/productManagement';

interface ProductFormProps {
  userId: string;
  product?: LocalProduct | null;
  onDone: () => void;
  onCancel: () => void;
}

export default function ProductForm({ userId, product, onDone, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  const [sku, setSku] = useState(product?.sku ?? '');
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      class="flex flex-col gap-2 rounded-lg border border-gray-300 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const input = { name, price, sku: sku.trim() || undefined, stock };
        const result = product
          ? await updateProduct(userId, product.id, input)
          : await createProduct(userId, input);

        setSubmitting(false);
        if (result.ok) onDone();
        else setError(result.error ?? 'Gagal menyimpan produk');
      }}
    >
      <h3 class="font-semibold">{product ? 'Edit Produk' : 'Tambah Produk'}</h3>

      <input
        required
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        placeholder="Nama produk"
        class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      />
      <input
        required
        type="number"
        min={0}
        value={price}
        onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))}
        placeholder="Harga (Rp)"
        class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      />
      <input
        value={sku}
        onInput={(e) => setSku((e.target as HTMLInputElement).value)}
        placeholder="SKU (opsional)"
        class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      />
      <input
        required
        type="number"
        min={0}
        value={stock}
        onInput={(e) => setStock(Number((e.target as HTMLInputElement).value))}
        placeholder="Stok"
        class="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      />

      {error && <p class="text-sm text-red-600">{error}</p>}

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          class="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:bg-gray-300"
        >
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button type="button" onClick={onCancel} class="rounded-md border border-gray-300 px-3 py-1 text-sm">
          Batal
        </button>
      </div>
    </form>
  );
}
