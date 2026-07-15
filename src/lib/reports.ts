import { db, type PaymentMethod, type TransactionItem } from './db';
import { supabase } from './supabase';

export interface ReportTransaction {
  id: string;
  total_amount: number;
  discount_amount: number;
  shipping_amount: number;
  payment_method: PaymentMethod;
  sync_status: string;
  client_created_at: string;
  items: TransactionItem[];
  voided_at: string | null;
}

export interface ReportResult {
  transactions: ReportTransaction[];
  source: 'online' | 'offline';
}

export interface VoidResult {
  ok: boolean;
  error?: string;
}

interface RawTransaction {
  id: string;
  total_amount: number | string;
  discount_amount?: number | string;
  shipping_amount?: number | string;
  payment_method?: PaymentMethod;
  sync_status: string;
  client_created_at: string;
  items: unknown;
  voided_at?: string | null;
}

function toReportTransaction(tx: RawTransaction): ReportTransaction {
  const items = Array.isArray(tx.items) ? (tx.items as TransactionItem[]) : [];

  return {
    id: tx.id,
    // Postgres numeric datang sebagai string lewat PostgREST - paksa ke integer rupiah.
    total_amount: Math.round(Number(tx.total_amount)),
    discount_amount: Math.round(Number(tx.discount_amount ?? 0)),
    shipping_amount: Math.round(Number(tx.shipping_amount ?? 0)),
    // transaksi lokal yang tersimpan sebelum fitur metode bayar ada belum punya field ini
    payment_method: tx.payment_method ?? 'cash',
    sync_status: tx.sync_status,
    client_created_at: tx.client_created_at,
    items,
    voided_at: tx.voided_at ?? null,
  };
}

// F09: query langsung ke Supabase saat online (lintas-device), fallback ke Dexie saat offline
// (data lokal saja, belum tentu lengkap). Void hanya bisa dilakukan terhadap data online (lihat
// voidTransaction) - transaksi pending lokal belum pernah tersinkron jadi belum ada yang dibatalkan.
export async function fetchTransactionReport(userId: string, fromIso: string, toIso: string): Promise<ReportResult> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, total_amount, discount_amount, shipping_amount, payment_method, sync_status, client_created_at, items, voided_at'
      )
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

  return { transactions: filtered.map((tx) => toReportTransaction({ ...tx, voided_at: null })), source: 'offline' };
}

// Pola "void" standar POS: transaksi tidak dihapus/diubah datanya, hanya ditandai batal + stok
// dikembalikan otomatis lewat RPC (bukan dilakukan di klien, supaya atomik & tidak race condition
// dengan sync engine perangkat lain). Butuh koneksi internet - hanya berlaku utk transaksi yang
// sudah tersinkron ke server.
export async function voidTransaction(transactionId: string): Promise<VoidResult> {
  if (!navigator.onLine) {
    return { ok: false, error: 'Perlu koneksi internet untuk membatalkan transaksi.' };
  }

  const { data, error } = await supabase.rpc('void_transaction', { p_transaction_id: transactionId });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Transaksi tidak ditemukan, sudah dibatalkan, atau Anda tidak berwenang.' };

  return { ok: true };
}
