import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import WebBluetoothReceiptPrinter, {
  type ConnectedBluetoothPrinter,
} from '@point-of-sale/webbluetooth-receipt-printer';
import type { TransactionItem } from './db';

// Longgar dengan sengaja (bukan LocalTransaction penuh) supaya bisa menerima transaksi dari
// sumber mana pun yang punya bentuk ini - keranjang (LocalTransaction) maupun laporan (ReportTransaction).
export interface PrintableTransaction {
  id: string;
  items: TransactionItem[];
  total_amount: number;
  discount_amount: number;
  shipping_amount: number;
  client_created_at: string;
}

export interface StoreInfo {
  name: string;
  address?: string | null;
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
  store: StoreInfo
): Promise<PrinterActionResult> {
  if (!printer) {
    return { ok: false, error: 'Web Bluetooth tidak didukung di browser ini.' };
  }
  if (!connectedDevice) {
    return { ok: false, error: 'Belum terhubung ke printer. Sambungkan printer terlebih dahulu.' };
  }

  try {
    const data = buildReceipt(transaction, store, connectedDevice);
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
  store: StoreInfo
): Promise<PrinterActionResult> {
  if (!isPrinterConnected()) {
    const connectResult = await connectPrinter();
    if (!connectResult.ok) return connectResult;
  }
  return printReceipt(transaction, store);
}

const DEFAULT_STORE_ADDRESS = 'Alam Elok F5 No.3, Bengle';
const NAME_COLUMN_WIDTH = 12; // lebar kolom nama produk & label ringkasan (Diskon/Pajak/Ongkir/GRAND TOTAL)

// Kertas 58mm - printer thermal kecil yang umum dipakai. Tanpa ini, encoder default ke 42 kolom
// (ukuran kertas 80mm) yang kepanjangan/terpotong di printer 58mm. Cross-check ke seluruh model 58mm
// asli di database pustaka ini (Epson TM-P20II, POS-5890, Star mC-Print2/mPOP/SM-L200) - semuanya
// konsisten 32 kolom untuk font standar 12x24 di 203 DPI, bukan angka tebakan.
const RECEIPT_COLUMNS = 32;

function formatThousands(n: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(n));
}

function formatRupiah(n: number): string {
  return `Rp${formatThousands(n)}`;
}

// Label diratakan ke kolom tetap lalu ": nilai" - mis. "Diskon      : (2.000)", "GRAND TOTAL : Rp23.000".
function labelLine(label: string, value: string): string {
  const padded = label.length < NAME_COLUMN_WIDTH ? label.padEnd(NAME_COLUMN_WIDTH) : label;
  return `${padded}: ${value}`;
}

function buildReceipt(
  transaction: PrintableTransaction,
  store: StoreInfo,
  device: ConnectedBluetoothPrinter
): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    language: device.language,
    codepageMapping: resolveCodepageMapping(device.language, device.codepageMapping),
    columns: RECEIPT_COLUMNS,
  });

  const columns = encoder.columns;
  const divider = '-'.repeat(columns);

  // Diskon & ongkir disimpan terpisah per transaksi, tapi pajak tidak (sudah tercakup di total_amount
  // sejak awal) - jadi diturunkan balik dari selisih, bukan ditebak: pajak = total - (subtotal - diskon) - ongkir.
  const subtotal = transaction.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const taxableAmount = Math.max(0, subtotal - transaction.discount_amount);
  const tax = transaction.total_amount - taxableAmount - transaction.shipping_amount;

  const address = store.address?.trim() || DEFAULT_STORE_ADDRESS;
  const transactionIdShort = transaction.id.slice(0, 8);
  const dateLabel = new Date(transaction.client_created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  encoder
    .initialize()
    .align('center')
    .bold(true)
    .line(store.name.toUpperCase())
    .bold(false)
    .align('left')
    .line(address)
    .line(divider)
    .line(`ID Transaksi: ${transactionIdShort}`)
    .line(`Tanggal: ${dateLabel}`)
    .line(divider);

  for (const item of transaction.items) {
    const detail = `${item.qty} x ${formatThousands(item.price)} = ${formatThousands(item.price * item.qty)}`;
    const namePart = item.name.length < NAME_COLUMN_WIDTH ? item.name.padEnd(NAME_COLUMN_WIDTH) : item.name;
    const combined = `${namePart} | ${detail}`;

    if (combined.length <= columns) {
      encoder.line(combined);
    } else {
      // Nama produk kepanjangan utk muat satu baris (mis. printer 32 kolom) - pisah jadi dua baris
      // daripada terpotong/terbungkus di tengah kata.
      encoder.line(item.name);
      encoder.line(`  | ${detail}`);
    }
  }

  encoder.line(divider);

  if (transaction.discount_amount > 0) {
    encoder.line(labelLine('Diskon', `(${formatThousands(transaction.discount_amount)})`));
  }
  if (tax > 0) {
    encoder.line(labelLine('Pajak', formatThousands(tax)));
  }
  if (transaction.shipping_amount > 0) {
    encoder.line(labelLine('Ongkir', formatThousands(transaction.shipping_amount)));
  }

  encoder
    .line(divider)
    .bold(true)
    .line(labelLine('GRAND TOTAL', formatRupiah(transaction.total_amount)))
    .bold(false)
    .line(divider)
    .align('center')
    .line('Terima Kasih')
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
