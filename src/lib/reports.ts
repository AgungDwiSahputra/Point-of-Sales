import { db } from './db';
import { supabase } from './supabase';

export interface ReportTransaction {
  id: string;
  total_amount: number;
  sync_status: string;
  client_created_at: string;
  item_count: number;
}

export interface ReportResult {
  transactions: ReportTransaction[];
  source: 'online' | 'offline';
  error?: string;
}

interface RawTransaction {
  id: string;
  total_amount: number | string;
  sync_status: string;
  client_created_at: string;
  items: unknown;
}

function toReportTransaction(tx: RawTransaction): ReportTransaction {
  const items = Array.isArray(tx.items) ? tx.items : [];
  const itemCount = items.reduce((sum: number, item) => {
    const qty = (item as { qty?: number })?.qty;
    return sum + (typeof qty === 'number' ? qty : 0);
  }, 0);

  return {
    id: tx.id,
    // Postgres numeric datang sebagai string lewat PostgREST - paksa ke integer rupiah.
    total_amount: Math.round(Number(tx.total_amount)),
    sync_status: tx.sync_status,
    client_created_at: tx.client_created_at,
    item_count: itemCount,
  };
}

// F09: query langsung ke Supabase saat online (lintas-device), fallback ke Dexie saat offline
// (data lokal saja, belum tentu lengkap).
export async function fetchTransactionReport(userId: string, fromIso: string, toIso: string): Promise<ReportResult> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, total_amount, sync_status, client_created_at, items')
      .eq('user_id', userId)
      .gte('client_created_at', fromIso)
      .lte('client_created_at', toIso)
      .order('client_created_at', { ascending: false });

    if (!error) {
      return { transactions: data.map(toReportTransaction), source: 'online' };
    }
    // Query online gagal karena sebab lain (bukan offline) - tetap coba fallback lokal di bawah.
  }

  const local = await db.transactions.where('user_id').equals(userId).toArray();
  const filtered = local.filter((tx) => tx.client_created_at >= fromIso && tx.client_created_at <= toIso);
  filtered.sort((a, b) => (a.client_created_at < b.client_created_at ? 1 : -1));

  return { transactions: filtered.map(toReportTransaction), source: 'offline' };
}
