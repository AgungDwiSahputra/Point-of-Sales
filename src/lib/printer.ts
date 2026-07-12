import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import WebBluetoothReceiptPrinter, {
  type ConnectedBluetoothPrinter,
} from '@point-of-sale/webbluetooth-receipt-printer';
import type { TransactionItem } from './db';

// Longgar dengan sengaja (bukan LocalTransaction penuh) supaya bisa menerima transaksi dari
// sumber mana pun yang punya bentuk ini - keranjang (LocalTransaction) maupun laporan (ReportTransaction).
export interface PrintableTransaction {
  items: TransactionItem[];
  total_amount: number;
  client_created_at: string;
}

export function isBluetoothPrintingSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// Instance tunggal - Web Bluetooth API mengelola satu koneksi perangkat pada satu waktu.
const printer = isBluetoothPrintingSupported() ? new WebBluetoothReceiptPrinter() : null;
let connectedDevice: ConnectedBluetoothPrinter | null = null;

const LAST_DEVICE_STORAGE_KEY = 'sahma-pos-last-printer-device';

function saveLastDevice(device: ConnectedBluetoothPrinter): void {
  try {
    localStorage.setItem(LAST_DEVICE_STORAGE_KEY, JSON.stringify({ id: device.id }));
  } catch {
    // localStorage bisa gagal (mode privat dsb) - reconnect otomatis bukan fitur esensial, abaikan saja.
  }
}

function getLastDevice(): { id: string } | null {
  try {
    const raw = localStorage.getItem(LAST_DEVICE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Listener internal - selalu aktif sejak modul dimuat, terpisah dari callback yang didaftarkan UI lewat
// onPrinterConnected/onPrinterDisconnected - supaya state & auto-reconnect tetap jalan walau belum ada
// komponen yang mount duluan.
printer?.addEventListener('connected', (device) => {
  connectedDevice = device;
  saveLastDevice(device);
});

printer?.addEventListener('disconnected', () => {
  connectedDevice = null;
  void tryAutoReconnect(); // printer mungkin cuma sesaat di luar jangkauan - coba sambung ulang sendiri
});

export function onPrinterConnected(callback: (device: ConnectedBluetoothPrinter) => void): void {
  printer?.addEventListener('connected', callback);
}

export function onPrinterDisconnected(callback: () => void): void {
  printer?.addEventListener('disconnected', callback);
}

export function isPrinterConnected(): boolean {
  return connectedDevice !== null;
}

// Coba sambung ulang TANPA menampilkan dialog pemilihan perangkat (jadi bisa dipanggil otomatis,
// tidak perlu klik pengguna). Ini hanya berhasil kalau browser mendukung navigator.bluetooth.getDevices()
// (izin Bluetooth persisten) - per 2026 API ini masih di belakang flag eksperimental Chrome
// (chrome://flags/#enable-web-bluetooth-new-permissions-backend), belum aktif default di kebanyakan
// browser. Kalau tidak didukung/perangkat tidak ditemukan, fungsi ini gagal diam-diam (aman, tidak
// merusak apa pun) - pengguna tinggal klik "Sambungkan Printer" seperti biasa.
export async function tryAutoReconnect(): Promise<boolean> {
  if (!printer) return false;
  const lastDevice = getLastDevice();
  if (!lastDevice) return false;

  try {
    await printer.reconnect(lastDevice);
  } catch {
    return false;
  }
  return isPrinterConnected();
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

export async function printReceipt(
  transaction: PrintableTransaction,
  storeName: string
): Promise<PrinterActionResult> {
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

// Gabungkan sambung + cetak jadi satu klik pengguna: requestDevice() (di dalam connectPrinter())
// tetap terpicu langsung dari gesture klik ini (belum ada await lain sebelumnya), jadi tidak melanggar
// persyaratan user-activation Web Bluetooth - operasi GATT connect/print setelahnya tidak butuh gesture baru.
export async function connectAndPrint(
  transaction: PrintableTransaction,
  storeName: string
): Promise<PrinterActionResult> {
  if (!isPrinterConnected()) {
    const connectResult = await connectPrinter();
    if (!connectResult.ok) return connectResult;
  }
  return printReceipt(transaction, storeName);
}

function buildReceipt(
  transaction: PrintableTransaction,
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
