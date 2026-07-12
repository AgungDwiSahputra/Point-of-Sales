import { useEffect, useState } from 'preact/hooks';
import { fetchTransactionReport, type ReportTransaction } from '../lib/reports';

const currency = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

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

export default function TransactionHistory({ userId }: { userId: string }) {
  const [fromDate, setFromDate] = useState(todayDateString());
  const [toDate, setToDate] = useState(todayDateString());
  const [transactions, setTransactions] = useState<ReportTransaction[]>([]);
  const [source, setSource] = useState<'online' | 'offline' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTransactionReport(userId, localDateBoundToIso(fromDate, false), localDateBoundToIso(toDate, true)).then(
      (result) => {
        if (cancelled) return;
        setTransactions(result.transactions);
        setSource(result.source);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [userId, fromDate, toDate]);

  const total = transactions.reduce((sum, tx) => sum + tx.total_amount, 0);

  return (
    <div class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Riwayat &amp; Laporan</h2>

      <div class="flex gap-2">
        <label class="flex flex-col text-sm">
          Dari
          <input
            type="date"
            value={fromDate}
            onInput={(e) => setFromDate((e.target as HTMLInputElement).value)}
            class="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label class="flex flex-col text-sm">
          Sampai
          <input
            type="date"
            value={toDate}
            onInput={(e) => setToDate((e.target as HTMLInputElement).value)}
            class="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {source === 'offline' && (
        <p class="text-xs font-medium text-amber-600">
          Data lokal (offline), belum tentu lengkap - transaksi dari device lain belum tentu ada di sini.
        </p>
      )}

      {loading ? (
        <p class="text-sm text-gray-500">Memuat...</p>
      ) : transactions.length === 0 ? (
        <p class="text-sm text-gray-500">Tidak ada transaksi pada rentang tanggal ini.</p>
      ) : (
        <>
          <ul class="flex flex-col gap-1">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                class="flex items-center justify-between rounded-lg border border-gray-200 p-2 text-sm"
              >
                <div>
                  <p>{new Date(tx.client_created_at).toLocaleString('id-ID')}</p>
                  <p class="text-xs text-gray-400">
                    {tx.item_count} item &middot; {tx.sync_status}
                  </p>
                </div>
                <p class="font-medium">{currency.format(tx.total_amount)}</p>
              </li>
            ))}
          </ul>
          <div class="flex items-center justify-between border-t border-gray-200 pt-2 font-semibold">
            <span>Total Penjualan</span>
            <span>{currency.format(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
