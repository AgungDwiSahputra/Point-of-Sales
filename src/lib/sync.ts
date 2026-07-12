import { db, type LocalTransaction } from './db';
import { supabase } from './supabase';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 30_000;

let syncingAll = false;
const inFlight = new Set<string>();

export function startSyncEngine(): () => void {
  const trigger = () => void syncPendingTransactions();

  window.addEventListener('online', trigger);
  const interval = setInterval(() => {
    if (navigator.onLine) trigger();
  }, POLL_INTERVAL_MS);

  trigger();

  return () => {
    window.removeEventListener('online', trigger);
    clearInterval(interval);
  };
}

export async function syncPendingTransactions(): Promise<void> {
  if (syncingAll || !navigator.onLine) return;
  syncingAll = true;

  try {
    const pending = await db.transactions.where('sync_status').equals('pending').sortBy('client_created_at');
    for (const tx of pending) {
      await syncOne(tx);
    }
  } finally {
    syncingAll = false;
  }
}

async function syncOne(tx: LocalTransaction): Promise<void> {
  if (inFlight.has(tx.id)) return;
  inFlight.add(tx.id);

  try {
    let stockOk = true;
    const syncedItemIds = [...tx.synced_item_ids];

    for (const item of tx.items) {
      if (syncedItemIds.includes(item.product_id)) continue; // sudah didekremen di percobaan sebelumnya

      const { data, error } = await supabase.rpc('decrement_stock', {
        p_product_id: item.product_id,
        p_qty: item.qty,
      });

      if (error) {
        await db.transactions.update(tx.id, { synced_item_ids: syncedItemIds });
        await scheduleRetry(tx, error.message);
        return;
      }

      syncedItemIds.push(item.product_id);
      if (data === false) stockOk = false; // stok tidak cukup di server, bukan error jaringan
    }

    const finalStatus = stockOk ? 'synced' : 'needs_review';
    const { error: upsertError } = await supabase.from('transactions').upsert(
      {
        id: tx.id,
        user_id: tx.user_id,
        cashier_id: tx.cashier_id ?? null,
        total_amount: tx.total_amount,
        items: tx.items,
        sync_status: finalStatus,
        client_created_at: tx.client_created_at,
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      await db.transactions.update(tx.id, { synced_item_ids: syncedItemIds });
      await scheduleRetry(tx, upsertError.message);
      return;
    }

    await db.transactions.update(tx.id, { sync_status: finalStatus, synced_item_ids: syncedItemIds });
  } finally {
    inFlight.delete(tx.id);
  }
}

async function scheduleRetry(tx: LocalTransaction, message: string): Promise<void> {
  const attempts = tx.sync_attempts + 1;
  await logSyncError(tx, message);

  if (attempts >= MAX_ATTEMPTS) {
    await db.transactions.update(tx.id, {
      sync_status: 'sync_error',
      sync_attempts: attempts,
      sync_error_message: message,
    });
    return;
  }

  await db.transactions.update(tx.id, { sync_attempts: attempts, sync_error_message: message });

  const delay = BASE_DELAY_MS * 2 ** (attempts - 1);
  setTimeout(() => {
    void (async () => {
      const fresh = await db.transactions.get(tx.id);
      if (fresh && fresh.sync_status === 'pending') await syncOne(fresh);
    })();
  }, delay);
}

// Audit server-side (NFR Observability) supaya owner bisa lihat riwayat gagal sync dari device manapun,
// bukan cuma sync_error_message lokal di Dexie yang cuma terlihat di device yang bersangkutan.
// Tidak boleh pernah melempar - kalau gagal (mis. justru sedang offline), retry lokal harus tetap jalan.
async function logSyncError(tx: LocalTransaction, message: string): Promise<void> {
  try {
    const { error } = await supabase.from('sync_logs').insert({
      user_id: tx.user_id,
      transaction_id: tx.id,
      error_message: message,
    });
    if (error) console.error('Gagal mencatat sync_logs:', error.message);
  } catch (err) {
    console.error('Gagal mencatat sync_logs:', err);
  }
}
