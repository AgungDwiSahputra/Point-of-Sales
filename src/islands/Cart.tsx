import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LocalTransaction, PaymentMethod } from '../lib/db';
import {
  connectAndPrint,
  isBluetoothPrintingSupported,
  isPrinterConnected,
  onPrinterConnected,
  onPrinterDisconnected,
  tryAutoReconnect,
} from '../lib/printer';
import {
  cartItems,
  cartSubtotal,
  cartTax,
  cartTotal,
  checkout,
  clearCart,
  discountAmount,
  loadCart,
  removeFromCart,
  setDiscount,
  setShipping,
  setTaxRate,
  shippingAmount,
  taxRatePercent,
  updateQty,
} from '../stores/cart';
import type { Profile } from '../stores/profile';
import { BluetoothIcon, MinusIcon, PlusIcon, ReceiptIcon, ShoppingBagIcon, TrashIcon } from './icons';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const smallFieldClass =
  'w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10';

const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'qris', label: 'QRIS' },
];

export default function Cart({ profile }: { profile: Profile }) {
  const items = useStore(cartItems);
  const subtotal = useStore(cartSubtotal);
  const discount = useStore(discountAmount);
  const taxRate = useStore(taxRatePercent);
  const shipping = useStore(shippingAmount);
  const tax = useStore(cartTax);
  const total = useStore(cartTotal);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const checkoutInFlight = useRef(false);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<LocalTransaction | null>(null);

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    onPrinterConnected(() => setPrinterConnected(true));
    onPrinterDisconnected(() => setPrinterConnected(false));
    setPrinterConnected(isPrinterConnected());
    void tryAutoReconnect(); // sambung ulang otomatis kalau pernah tersambung & browser mendukungnya
  }, []);

  return (
    <div class="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      <div class="flex items-center gap-2">
        <ShoppingBagIcon class="h-5 w-5 text-brand-600" />
        <h2 class="text-base font-semibold text-slate-900">Keranjang</h2>
        {items.length > 0 && (
          <span class="ml-auto rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
            {items.reduce((sum, i) => sum + i.qty, 0)} item
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div class="flex flex-col items-center gap-2 py-6 text-center">
          <ShoppingBagIcon class="h-7 w-7 text-slate-300" />
          <p class="text-sm text-slate-500">Keranjang masih kosong.</p>
        </div>
      ) : (
        <ul class="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.product_id} class="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{item.name}</p>
                <p class="text-xs text-slate-500">
                  {currency.format(item.price)} &times; {item.qty}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateQty(item.product_id, item.qty - 1)}
                  class="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
                  aria-label="Kurangi"
                >
                  <MinusIcon class="h-3.5 w-3.5" />
                </button>
                <span class="w-5 text-center text-sm font-medium">{item.qty}</span>
                <button
                  type="button"
                  disabled={item.qty >= item.stock}
                  onClick={() => updateQty(item.product_id, item.qty + 1)}
                  class="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                  aria-label="Tambah"
                >
                  <PlusIcon class="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeFromCart(item.product_id)}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Hapus item"
              >
                <TrashIcon class="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div class="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <div class="flex items-center justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span>{currency.format(subtotal)}</span>
          </div>

          <label class="flex items-center justify-between gap-2 text-sm text-slate-600">
            <span>Diskon (Rp)</span>
            <input
              type="number"
              min={0}
              value={discount}
              onInput={(e) => setDiscount(Number((e.target as HTMLInputElement).value))}
              class={smallFieldClass}
            />
          </label>

          <label class="flex items-center justify-between gap-2 text-sm text-slate-600">
            <span>Pajak (%)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={taxRate}
              onInput={(e) => setTaxRate(Number((e.target as HTMLInputElement).value))}
              class={smallFieldClass}
            />
          </label>

          <div class="flex items-center justify-between text-sm text-slate-500">
            <span>Pajak ({taxRate}%)</span>
            <span>{currency.format(tax)}</span>
          </div>

          <label class="flex items-center justify-between gap-2 text-sm text-slate-600">
            <span>Ongkir (Rp)</span>
            <input
              type="number"
              min={0}
              value={shipping}
              onInput={(e) => setShipping(Number((e.target as HTMLInputElement).value))}
              class={smallFieldClass}
            />
          </label>

          <div class="flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span class="text-sm font-semibold text-slate-900">Total</span>
            <span class="text-lg font-bold text-brand-700">{currency.format(total)}</span>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-slate-500">Metode Bayar</span>
            <div class="flex gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPaymentMethod(m.key)}
                  class={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    paymentMethod === m.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              if (checkoutInFlight.current) return;
              checkoutInFlight.current = true;
              setMessage(null);
              setSubmitting(true);
              const result = await checkout(profile, paymentMethod);
              setSubmitting(false);
              checkoutInFlight.current = false;
              setLastTransaction(result.transaction ?? null);
              setMessage(
                result.ok
                  ? { type: 'success', text: 'Transaksi tersimpan.' }
                  : { type: 'error', text: result.error ?? 'Checkout gagal' }
              );
            }}
            class="mt-1 rounded-xl bg-accent-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-700 active:bg-accent-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? 'Memproses...' : `Checkout · ${currency.format(total)}`}
          </button>
          <button
            type="button"
            onClick={() => clearCart()}
            class="text-center text-xs text-slate-400 transition hover:text-red-600"
          >
            Kosongkan keranjang
          </button>
        </div>
      )}

      {message && (
        <p
          class={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-accent-50 text-accent-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      )}

      <div class="flex flex-col gap-2 border-t border-slate-100 pt-3">
        <div class="flex items-center gap-2">
          <BluetoothIcon class="h-4 w-4 text-slate-400" />
          <p class="text-sm font-medium text-slate-700">Printer Struk</p>
        </div>

        {!isBluetoothPrintingSupported() ? (
          <p class="text-xs text-slate-500">
            Perangkat/browser ini tidak mendukung cetak Bluetooth. <strong>iOS tidak didukung sama sekali</strong>{' '}
            (termasuk Chrome/Firefox di iPhone/iPad - semua browser di iOS wajib pakai mesin Safari, bukan
            batasan pilihan browser). Gunakan Android, Windows, atau Mac (Chrome/Edge) untuk mencetak.
          </p>
        ) : (
          <>
            {printerConnected && (
              <p class="flex items-center gap-1.5 text-xs font-medium text-accent-700">
                <span class="h-1.5 w-1.5 rounded-full bg-accent-500" />
                Printer tersambung
              </p>
            )}
            {lastTransaction && (
              <button
                type="button"
                disabled={printing}
                onClick={async () => {
                  setMessage(null);
                  setPrinting(true);
                  const result = await connectAndPrint(lastTransaction, {
                    name: profile.store_name,
                    address: profile.address,
                  });
                  setPrinting(false);
                  setMessage(
                    result.ok
                      ? { type: 'success', text: 'Struk berhasil dicetak.' }
                      : { type: 'error', text: result.error ?? 'Gagal mencetak struk' }
                  );
                }}
                class="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900 disabled:bg-slate-300"
              >
                <ReceiptIcon class="h-4 w-4" />
                {printing ? 'Mencetak...' : 'Cetak Struk Terakhir'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
