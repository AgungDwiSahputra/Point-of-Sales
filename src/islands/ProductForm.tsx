import { useState } from 'preact/hooks';
import type { LocalProduct } from '../lib/db';
import { createProduct, updateProduct } from '../lib/productManagement';

interface ProductFormProps {
  userId: string;
  product?: LocalProduct | null;
  onDone: () => void;
  onCancel: () => void;
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10';

export default function ProductForm({ userId, product, onDone, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  const [sku, setSku] = useState(product?.sku ?? '');
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      class="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const input = { name, price, sku: sku.trim() || undefined, stock };
        const result = product ? await updateProduct(product.id, input) : await createProduct(userId, input);

        setSubmitting(false);
        if (result.ok) onDone();
        else setError(result.error ?? 'Gagal menyimpan produk');
      }}
    >
      <h3 class="text-sm font-semibold text-slate-900">{product ? 'Edit Produk' : 'Tambah Produk Baru'}</h3>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 sm:col-span-2">
          <span class="text-xs font-medium text-slate-600">Nama produk</span>
          <input
            required
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="mis. Kopi Susu Gula Aren"
            class={fieldClass}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-600">Harga (Rp)</span>
          <input
            required
            type="number"
            min={0}
            value={price}
            onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))}
            class={fieldClass}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-600">Stok</span>
          <input
            required
            type="number"
            min={0}
            value={stock}
            onInput={(e) => setStock(Number((e.target as HTMLInputElement).value))}
            class={fieldClass}
          />
        </label>
        <label class="flex flex-col gap-1 sm:col-span-2">
          <span class="text-xs font-medium text-slate-600">SKU (opsional)</span>
          <input
            value={sku}
            onInput={(e) => setSku((e.target as HTMLInputElement).value)}
            placeholder="mis. KSG-001"
            class={fieldClass}
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
          onClick={onCancel}
          class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
