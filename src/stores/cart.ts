import { atom, computed } from 'nanostores';
import { db, type CartItem, type LocalTransaction } from '../lib/db';
import type { Profile } from './profile';
import { syncPendingTransactions } from '../lib/sync';

export const cartItems = atom<CartItem[]>([]);

export const cartSubtotal = computed(cartItems, (items) =>
  items.reduce((sum, item) => sum + item.price * item.qty, 0)
);

export const cartItemCount = computed(cartItems, (items) =>
  items.reduce((sum, item) => sum + item.qty, 0)
);

// Diskon (rupiah), pajak (%), & ongkir (rupiah) diinput manual oleh kasir per transaksi (F03) - belum
// ada halaman pengaturan tarif pajak toko, jadi defaultnya 0 dan kasir yang menentukan saat checkout.
export const discountAmount = atom<number>(0);
export const taxRatePercent = atom<number>(0);
export const shippingAmount = atom<number>(0);

export const cartTaxableAmount = computed([cartSubtotal, discountAmount], (subtotal, discount) =>
  Math.max(0, subtotal - discount)
);

// Dibulatkan ke rupiah bulat (integer) - hindari floating point JS untuk uang
export const cartTax = computed([cartTaxableAmount, taxRatePercent], (taxable, taxRate) =>
  Math.round(taxable * (taxRate / 100))
);

// Ongkir ditambahkan setelah pajak (tidak ikut dikenai pajak) - konvensi umum, ongkir bukan bagian
// dari nilai barang yang dijual.
export const cartTotal = computed(
  [cartTaxableAmount, cartTax, shippingAmount],
  (taxable, tax, shipping) => taxable + tax + shipping
);

export function setDiscount(amount: number): void {
  discountAmount.set(Math.max(0, Math.round(amount)));
}

export function setTaxRate(percent: number): void {
  taxRatePercent.set(Math.max(0, percent));
}

export function setShipping(amount: number): void {
  shippingAmount.set(Math.max(0, Math.round(amount)));
}

export async function loadCart(): Promise<void> {
  cartItems.set(await db.cart.toArray());
}

interface CartableProduct {
  product_id: string;
  name: string;
  price: number;
  stock: number;
}

export async function addToCart(product: CartableProduct): Promise<void> {
  const current = cartItems.get();
  const existing = current.find((item) => item.product_id === product.product_id);
  const nextQty = (existing?.qty ?? 0) + 1;

  if (nextQty > product.stock) return; // validasi stok terhadap cache lokal (F03)

  const updated: CartItem = { ...product, qty: nextQty };
  const nextItems = existing
    ? current.map((item) => (item.product_id === product.product_id ? updated : item))
    : [...current, updated];

  cartItems.set(nextItems);
  await db.cart.put(updated);
}

export async function updateQty(product_id: string, qty: number): Promise<void> {
  if (qty <= 0) {
    await removeFromCart(product_id);
    return;
  }

  const current = cartItems.get();
  const item = current.find((i) => i.product_id === product_id);
  if (!item || qty > item.stock) return; // validasi stok terhadap cache lokal (F03)

  const updated = { ...item, qty };
  cartItems.set(current.map((i) => (i.product_id === product_id ? updated : i)));
  await db.cart.put(updated);
}

export async function removeFromCart(product_id: string): Promise<void> {
  cartItems.set(cartItems.get().filter((i) => i.product_id !== product_id));
  await db.cart.delete(product_id);
}

export async function clearCart(): Promise<void> {
  cartItems.set([]);
  await db.cart.clear();
  discountAmount.set(0);
  taxRatePercent.set(0);
  shippingAmount.set(0);
}

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  transaction?: LocalTransaction;
}

let checkoutInFlight = false;

export async function checkout(profile: Profile): Promise<CheckoutResult> {
  if (checkoutInFlight) return { ok: false, error: 'Checkout sedang diproses' };
  checkoutInFlight = true;

  try {
    const items = cartItems.get();
    if (items.length === 0) return { ok: false, error: 'Keranjang kosong' };

    // Validasi ulang stok terhadap cache lokal terbaru (F03), bukan cuma snapshot saat item ditambahkan
    for (const item of items) {
      const product = await db.products.get(item.product_id);
      if (!product || product.stock < item.qty) {
        return { ok: false, error: `Stok "${item.name}" tidak cukup` };
      }
    }

    const isCashier = profile.role === 'cashier' && profile.owner_id;
    const transaction: LocalTransaction = {
      id: crypto.randomUUID(),
      user_id: isCashier ? (profile.owner_id as string) : profile.id,
      cashier_id: isCashier ? profile.id : undefined,
      total_amount: cartTotal.get(),
      discount_amount: discountAmount.get(),
      shipping_amount: shippingAmount.get(),
      items: items.map(({ product_id, name, price, qty }) => ({ product_id, name, price, qty })),
      sync_status: 'pending',
      client_created_at: new Date().toISOString(),
      sync_attempts: 0,
      synced_item_ids: [],
    };

    await db.transactions.add(transaction);
    await clearCart();
    void syncPendingTransactions(); // coba sinkron langsung kalau online, tanpa menunggu polling berikutnya

    return { ok: true, transaction };
  } finally {
    checkoutInFlight = false;
  }
}
