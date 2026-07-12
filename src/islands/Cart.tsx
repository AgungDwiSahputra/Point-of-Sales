import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import type { LocalTransaction } from '../lib/db';
import {
  connectPrinter,
  isBluetoothPrintingSupported,
  isPrinterConnected,
  onPrinterConnected,
  onPrinterDisconnected,
  printReceipt,
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
  setTaxRate,
  taxRatePercent,
  updateQty,
} from '../stores/cart';
import type { Profile } from '../stores/profile';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export default function Cart({ profile }: { profile: Profile }) {
  const items = useStore(cartItems);
  const subtotal = useStore(cartSubtotal);
  const discount = useStore(discountAmount);
  const taxRate = useStore(taxRatePercent);
  const tax = useStore(cartTax);
  const total = useStore(cartTotal);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<LocalTransaction | null>(null);

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    onPrinterConnected(() => setPrinterConnected(true));
    onPrinterDisconnected(() => setPrinterConnected(false));
    setPrinterConnected(isPrinterConnected());
  }, []);

  return (
    <div class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Keranjang</h2>

      {items.length === 0 ? (
        <p class="text-sm text-gray-500">Keranjang kosong.</p>
      ) : (
        <ul class="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.product_id}
              class="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2"
            >
              <div>
                <p class="font-medium">{item.name}</p>
                <p class="text-xs text-gray-500">
                  {currency.format(item.price)} x {item.qty}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateQty(item.product_id, item.qty - 1)}
                  class="rounded border px-2"
                >
                  -
                </button>
                <span class="w-6 text-center">{item.qty}</span>
                <button
                  type="button"
                  disabled={item.qty >= item.stock}
                  onClick={() => updateQty(item.product_id, item.qty + 1)}
                  class="rounded border px-2 disabled:opacity-40"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.product_id)}
                  class="ml-2 text-sm text-red-600"
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div class="flex flex-col gap-2 border-t border-gray-200 pt-2">
          <div class="flex items-center justify-between text-sm">
            <span>Subtotal</span>
            <span>{currency.format(subtotal)}</span>
          </div>

          <label class="flex items-center justify-between gap-2 text-sm">
            <span>Diskon (Rp)</span>
            <input
              type="number"
              min={0}
              value={discount}
              onInput={(e) => setDiscount(Number((e.target as HTMLInputElement).value))}
              class="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label class="flex items-center justify-between gap-2 text-sm">
            <span>Pajak (%)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={taxRate}
              onInput={(e) => setTaxRate(Number((e.target as HTMLInputElement).value))}
              class="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div class="flex items-center justify-between text-sm text-gray-500">
            <span>Pajak ({taxRate}%)</span>
            <span>{currency.format(tax)}</span>
          </div>

          <div class="flex items-center justify-between border-t border-gray-200 pt-2 font-semibold">
            <span>Total</span>
            <span>{currency.format(total)}</span>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setMessage(null);
              setSubmitting(true);
              const result = await checkout(profile);
              setSubmitting(false);
              setLastTransaction(result.transaction ?? null);
              setMessage(
                result.ok
                  ? { type: 'success', text: 'Transaksi tersimpan.' }
                  : { type: 'error', text: result.error ?? 'Checkout gagal' }
              );
            }}
            class="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {submitting ? 'Memproses...' : 'Checkout'}
          </button>
          <button type="button" onClick={() => clearCart()} class="text-sm text-gray-500 underline">
            Kosongkan keranjang
          </button>
        </div>
      )}

      {message && (
        <p class={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div class="flex flex-col gap-2 border-t border-gray-200 pt-3">
        <p class="text-sm font-medium">Printer Struk (Bluetooth)</p>

        {!isBluetoothPrintingSupported() ? (
          <p class="text-xs text-gray-500">
            Web Bluetooth tidak didukung di browser ini. Gunakan Chrome/Edge di Android atau Desktop.
          </p>
        ) : !printerConnected ? (
          <button
            type="button"
            disabled={connecting}
            onClick={async () => {
              setMessage(null);
              setConnecting(true);
              const result = await connectPrinter();
              setConnecting(false);
              if (!result.ok) setMessage({ type: 'error', text: result.error ?? 'Gagal menyambungkan printer' });
            }}
            class="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {connecting ? 'Menyambungkan...' : 'Sambungkan Printer'}
          </button>
        ) : (
          <p class="text-xs text-green-600">Printer tersambung.</p>
        )}

        {printerConnected && lastTransaction && (
          <button
            type="button"
            disabled={printing}
            onClick={async () => {
              setMessage(null);
              setPrinting(true);
              const result = await printReceipt(lastTransaction, profile.store_name);
              setPrinting(false);
              setMessage(
                result.ok
                  ? { type: 'success', text: 'Struk berhasil dicetak.' }
                  : { type: 'error', text: result.error ?? 'Gagal mencetak struk' }
              );
            }}
            class="rounded-md bg-gray-800 px-3 py-2 text-sm text-white disabled:bg-gray-300"
          >
            {printing ? 'Mencetak...' : 'Cetak Struk Terakhir'}
          </button>
        )}
      </div>
    </div>
  );
}
