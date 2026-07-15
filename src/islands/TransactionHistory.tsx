import { useEffect, useState } from 'preact/hooks';
import {
  connectAndPrint,
  isBluetoothPrintingSupported,
  isPrinterConnected,
  onPrinterConnected,
  onPrinterDisconnected,
} from '../lib/printer';
import { fetchTransactionReport, voidTransaction, type ReportTransaction } from '../lib/reports';
import { BluetoothIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon, ReceiptIcon } from './icons';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const STATUS_STYLES: Record<string, string> = {
  synced: 'bg-accent-50 text-accent-700',
  needs_review: 'bg-amber-50 text-amber-700',
  pending: 'bg-brand-50 text-brand-700',
  sync_error: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  synced: 'Tersinkron',
  needs_review: 'Perlu ditinjau',
  pending: 'Menunggu',
  sync_error: 'Gagal sync',
};

function todayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// input type="date" memberi string tanggal lokal tanpa info zona waktu - konstruktor Date multi-argumen
// menafsirkannya sebagai waktu LOKAL (bukan UTC seperti string ISO "YYYY-MM-DD" polos), supaya batas
// hari cocok dengan kalender lokal pengguna, bukan geser karena zona waktu.
function localDateBoundToIso(dateStr: string, endOfDay: boolean): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

function dateStringDaysAgo(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Senin dianggap awal minggu (konvensi kalender Indonesia), bukan Minggu seperti default getDay() JS
function mondayOfThisWeekDateString(): string {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  now.setDate(now.getDate() - daysSinceMonday);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DATE_PRESETS = [
  { key: 'custom', label: 'Custom' },
  { key: 'yesterday', label: '1 Hari Lalu' },
  { key: 'today', label: 'Hari Ini' },
  { key: 'week', label: 'Minggu Ini' },
] as const;

type DatePresetKey = (typeof DATE_PRESETS)[number]['key'];

interface TransactionHistoryProps {
  userId: string;
  storeName: string;
  storeAddress: string | null;
}

export default function TransactionHistory({ userId, storeName, storeAddress }: TransactionHistoryProps) {
  const [fromDate, setFromDate] = useState(todayDateString());
  const [toDate, setToDate] = useState(todayDateString());
  const [datePreset, setDatePreset] = useState<DatePresetKey>('today');
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [source, setSource] = useState<'online' | 'offline' | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);
  const [printerConnected, setPrinterConnected] = useState(false);

  const load = () => {
    setLoading(true);
    fetchTransactionReport(userId, localDateBoundToIso(fromDate, false), localDateBoundToIso(toDate, true)).then(
      (result) => {
        setTransactions(result.transactions);
        setSource(result.source);
        setLoading(false);
      }
    );
  };

  useEffect(load, [userId, fromDate, toDate]);

  const applyDatePreset = (key: DatePresetKey) => {
    setDatePreset(key);
    if (key === 'today') {
      const d = todayDateString();
      setFromDate(d);
      setToDate(d);
    } else if (key === 'yesterday') {
      const d = dateStringDaysAgo(1);
      setFromDate(d);
      setToDate(d);
    } else if (key === 'week') {
      setFromDate(mondayOfThisWeekDateString());
      setToDate(todayDateString());
    }
    // 'custom' - biarkan fromDate/toDate apa adanya, diatur manual lewat input Dari/Sampai
  };

  useEffect(() => {
    onPrinterConnected(() => setPrinterConnected(true));
    onPrinterDisconnected(() => setPrinterConnected(false));
    setPrinterConnected(isPrinterConnected());
  }, []);

  const activeTransactions = transactions.filter((tx) => !tx.voided_at);
  const total = activeTransactions.reduce((sum, tx) => sum + tx.total_amount, 0);
  const totalItems = activeTransactions.reduce(
    (sum, tx) => sum + tx.items.reduce((itemSum, item) => itemSum + item.qty, 0),
    0
  );
  const voidedCount = transactions.length - activeTransactions.length;

  return (
    <div class="flex flex-col gap-4">
      <div class="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-card">
        <p class="text-sm text-brand-100">Total Penjualan</p>
        <p class="mt-1 text-3xl font-bold">{currency.format(total)}</p>
        <p class="mt-1 text-xs text-brand-100">
          {totalItems} item dari {activeTransactions.length} transaksi pada rentang terpilih
          {voidedCount > 0 && ` · ${voidedCount} dibatalkan`}
        </p>
      </div>

      <div class="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
        <div class="flex items-center gap-2 text-slate-700">
          <CalendarIcon class="h-4 w-4" />
          <span class="text-sm font-medium">Filter tanggal</span>
        </div>
        <div class="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyDatePreset(p.key)}
              class={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                datePreset === p.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex flex-col gap-1 text-xs text-slate-500">
              Dari
              <input
                type="date"
                value={fromDate}
                onInput={(e) => setFromDate((e.target as HTMLInputElement).value)}
                class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-500">
              Sampai
              <input
                type="date"
                value={toDate}
                onInput={(e) => setToDate((e.target as HTMLInputElement).value)}
                class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
          </div>
        )}

        {source === 'offline' && (
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Data lokal (offline), belum tentu lengkap — transaksi dari device lain belum tentu ada di sini.
            Cetak/batalkan transaksi butuh koneksi internet.
          </p>
        )}

        <div class="flex items-center gap-2 border-t border-slate-100 pt-3">
          <BluetoothIcon class="h-4 w-4 shrink-0 text-slate-400" />
          {!isBluetoothPrintingSupported() ? (
            <p class="text-xs text-slate-500">
              Cetak Bluetooth tidak didukung di perangkat/browser ini. <strong>iOS tidak didukung sama sekali</strong>{' '}
              (termasuk Chrome/Firefox di iPhone/iPad). Gunakan Android, Windows, atau Mac untuk mencetak dari sini.
            </p>
          ) : printerConnected ? (
            <p class="flex items-center gap-1.5 text-xs font-medium text-accent-700">
              <span class="h-1.5 w-1.5 rounded-full bg-accent-500" />
              Printer tersambung
            </p>
          ) : (
            <p class="text-xs text-slate-500">Klik "Cetak" pada transaksi untuk menyambungkan printer.</p>
          )}
        </div>
      </div>

      {loading ? (
        <div class="flex justify-center py-8">
          <div class="h-6 w-6 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
        </div>
      ) : transactions.length === 0 ? (
        <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <ReceiptIcon class="h-7 w-7 text-slate-300" />
          <p class="text-sm text-slate-500">Tidak ada transaksi pada rentang tanggal ini.</p>
        </div>
      ) : (
        <ul class="flex flex-col gap-2">
          {transactions.map((tx) => {
            const expanded = expandedId === tx.id;
            const voided = !!tx.voided_at;

            return (
              <li
                key={tx.id}
                class={`rounded-xl border border-slate-100 bg-white shadow-card ${voided ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : tx.id)}
                  class="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-slate-900">
                      {new Date(tx.client_created_at).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                    <div class="mt-1 flex items-center gap-2">
                      <span class="text-xs text-slate-500">
                        {tx.items.reduce((sum, item) => sum + item.qty, 0)} item
                      </span>
                      {voided ? (
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Dibatalkan
                        </span>
                      ) : (
                        <span
                          class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[tx.sync_status] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {STATUS_LABELS[tx.sync_status] ?? tx.sync_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <p class="text-sm font-semibold text-slate-900">{currency.format(tx.total_amount)}</p>
                    {expanded ? (
                      <ChevronUpIcon class="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDownIcon class="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div class="border-t border-slate-100 p-3">
                    <ul class="flex flex-col gap-1">
                      {tx.items.map((item, i) => (
                        <li key={i} class="flex items-center justify-between text-xs text-slate-600">
                          <span>
                            {item.name} &times; {item.qty}
                          </span>
                          <span>{currency.format(item.price * item.qty)}</span>
                        </li>
                      ))}
                    </ul>

                    {rowMessage?.id === tx.id && (
                      <p
                        class={`mt-2 rounded-lg px-3 py-1.5 text-xs ${
                          rowMessage.type === 'success' ? 'bg-accent-50 text-accent-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {rowMessage.text}
                      </p>
                    )}

                    {!voided && (
                      <div class="mt-3 flex flex-wrap gap-2">
                        {isBluetoothPrintingSupported() && (
                          <button
                            type="button"
                            disabled={busyId === tx.id}
                            onClick={async () => {
                              setBusyId(tx.id);
                              setRowMessage(null);
                              const result = await connectAndPrint(tx, { name: storeName, address: storeAddress });
                              setBusyId(null);
                              setRowMessage({
                                id: tx.id,
                                type: result.ok ? 'success' : 'error',
                                text: result.ok ? 'Struk berhasil dicetak.' : (result.error ?? 'Gagal mencetak'),
                              });
                            }}
                            class="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-900 disabled:bg-slate-300"
                          >
                            <ReceiptIcon class="h-3.5 w-3.5" />
                            {busyId === tx.id ? 'Mencetak...' : 'Cetak'}
                          </button>
                        )}

                        {source === 'online' &&
                          (confirmVoidId === tx.id ? (
                            <>
                              <button
                                type="button"
                                disabled={busyId === tx.id}
                                onClick={async () => {
                                  setBusyId(tx.id);
                                  setRowMessage(null);
                                  const result = await voidTransaction(tx.id);
                                  setBusyId(null);
                                  setConfirmVoidId(null);
                                  if (result.ok) load();
                                  else
                                    setRowMessage({
                                      id: tx.id,
                                      type: 'error',
                                      text: result.error ?? 'Gagal membatalkan transaksi',
                                    });
                                }}
                                class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:bg-slate-300"
                              >
                                {busyId === tx.id ? 'Memproses...' : 'Ya, batalkan'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmVoidId(null)}
                                class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                              >
                                Tidak
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmVoidId(tx.id)}
                              class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              Batalkan Transaksi
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
