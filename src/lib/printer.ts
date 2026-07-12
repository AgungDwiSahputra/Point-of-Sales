import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import WebBluetoothReceiptPrinter, {
  type ConnectedBluetoothPrinter,
} from '@point-of-sale/webbluetooth-receipt-printer';
import type { LocalTransaction } from './db';

export function isBluetoothPrintingSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// Instance tunggal - Web Bluetooth API mengelola satu koneksi perangkat pada satu waktu.
const printer = isBluetoothPrintingSupported() ? new WebBluetoothReceiptPrinter() : null;
let connectedDevice: ConnectedBluetoothPrinter | null = null;

export function onPrinterConnected(callback: (device: ConnectedBluetoothPrinter) => void): void {
  printer?.addEventListener('connected', (device) => {
    connectedDevice = device;
    callback(device);
  });
}

export function onPrinterDisconnected(callback: () => void): void {
  printer?.addEventListener('disconnected', () => {
    connectedDevice = null;
    callback();
  });
}

export function isPrinterConnected(): boolean {
  return connectedDevice !== null;
}

export interface PrinterActionResult {
  ok: boolean;
  error?: string;
}

// Daftar codepageMapping yang benar-benar dikenal oleh @point-of-sale/receipt-printer-encoder@3.0.3
// per bahasa printer. WebBluetoothReceiptPrinter mendeteksi model printer dari database-nya sendiri
// (paket terpisah, versi terpisah), jadi nilai yang dikembalikan bisa saja belum dikenal si encoder -
// makanya perlu divalidasi dulu, bukan diteruskan mentah-mentah (itu yang menyebabkan error
// "Unknown codepage mapping" sebelumnya).
const KNOWN_CODEPAGE_MAPPINGS: Record<string, string[]> = {
  'esc-pos': [
    'bixolon/legacy', 'bixolon', 'citizen', 'epson/legacy', 'epson',
    'fujitsu', 'hp', 'metapace', 'mpt', 'pos-5890', 'pos-8360',
    'star', 'xprinter', 'youku',
  ],
  'star-prnt': ['star'],
};

function resolveCodepageMapping(language: string, codepageMapping: string): string {
  const known = KNOWN_CODEPAGE_MAPPINGS[language] ?? [];
  if (known.includes(codepageMapping)) return codepageMapping;

  console.warn(
    `Codepage mapping "${codepageMapping}" untuk printer bahasa "${language}" tidak dikenal encoder, ` +
      `memakai fallback. Teks ASCII biasa (huruf latin, angka) tetap tercetak normal.`
  );
  return language === 'star-prnt' ? 'star' : 'epson'; // fallback paling umum utk printer ESC/POS generik
}

// Wajib dipanggil langsung dari event klik pengguna - persyaratan Web Bluetooth API,
// tidak bisa dipanggil otomatis saat halaman dimuat (§6.2 PRD).
export async function connectPrinter(): Promise<PrinterActionResult> {
  if (!printer) {
    return {
      ok: false,
      error: 'Web Bluetooth tidak didukung di browser ini. Gunakan Chrome/Edge di Android atau Desktop.',
    };
  }

  try {
    await printer.connect();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describePrinterError(error) };
  }
}

export async function printReceipt(transaction: LocalTransaction, storeName: string): Promise<PrinterActionResult> {
  if (!printer) {
    return { ok: false, error: 'Web Bluetooth tidak didukung di browser ini.' };
  }
  if (!connectedDevice) {
    return { ok: false, error: 'Belum terhubung ke printer. Sambungkan printer terlebih dahulu.' };
  }

  try {
    const data = buildReceipt(transaction, storeName, connectedDevice);
    await printer.print(data);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describePrinterError(error) };
  }
}

function buildReceipt(
  transaction: LocalTransaction,
  storeName: string,
  device: ConnectedBluetoothPrinter
): Uint8Array {
  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });

  const encoder = new ReceiptPrinterEncoder({
    language: device.language,
    codepageMapping: resolveCodepageMapping(device.language, device.codepageMapping),
  });

  encoder.initialize().align('center').bold(true).line(storeName).bold(false).align('left').newline();

  for (const item of transaction.items) {
    encoder.line(`${item.name}`);
    encoder.line(`  ${item.qty} x ${currency.format(item.price)} = ${currency.format(item.price * item.qty)}`);
  }

  encoder
    .newline()
    .bold(true)
    .line(`Total: ${currency.format(transaction.total_amount)}`)
    .bold(false)
    .newline()
    .align('center')
    .line(new Date(transaction.client_created_at).toLocaleString('id-ID'))
    .newline()
    .newline()
    .cut();

  return encoder.encode();
}

// Menangani GATTServerDisconnectedError & NotFoundError (user membatalkan pairing) secara eksplisit (§6.5 PRD).
function describePrinterError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';

  if (name === 'NotFoundError') return 'Pemilihan printer dibatalkan.';
  if (name === 'NetworkError' || name.includes('GATT')) {
    return 'Koneksi ke printer terputus. Pastikan printer menyala dan berada dekat perangkat.';
  }
  return error instanceof Error ? error.message : 'Gagal terhubung ke printer.';
}
