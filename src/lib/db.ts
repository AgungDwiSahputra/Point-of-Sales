import Dexie, { type Table } from 'dexie';

export interface LocalProduct {
  id: string; // uuid, sama dengan products.id di Supabase
  user_id: string;
  name: string;
  price: number; // rupiah bulat (integer), bukan desimal/float
  sku?: string;
  stock: number;
  is_active: boolean;
  updated_at: string;
}

export interface TransactionItem {
  product_id: string;
  name: string;
  price: number; // rupiah bulat (integer), bukan desimal/float
  qty: number;
}

export type TransactionSyncStatus = 'pending' | 'synced' | 'needs_review' | 'sync_error';

export interface LocalTransaction {
  id: string; // uuid v4 dibuat di klien saat offline
  user_id: string;
  cashier_id?: string;
  total_amount: number; // rupiah bulat (integer), bukan desimal/float
  items: TransactionItem[];
  sync_status: TransactionSyncStatus; // 'pending' & 'sync_error' hanya ada lokal; ke Supabase hanya kirim 'synced'/'needs_review'
  client_created_at: string;
  created_at?: string;
  sync_attempts: number;
  sync_error_message?: string;
  synced_item_ids: string[]; // product_id yang decrement_stock-nya sudah sukses; mencegah stok dikurangi dobel saat retry
}

export interface CartItem {
  product_id: string;
  name: string;
  price: number; // rupiah bulat (integer), bukan desimal/float
  qty: number;
  stock: number; // snapshot stok terakhir diketahui, untuk validasi cepat sebelum checkout
}

class PosDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  transactions!: Table<LocalTransaction, string>;
  cart!: Table<CartItem, string>;

  constructor() {
    super('pos_db');
    this.version(1).stores({
      products: 'id, user_id, sku, name',
      transactions: 'id, user_id, sync_status, client_created_at',
      cart: 'product_id',
    });
  }
}

export const db = new PosDatabase();
