# PRODUCT REQUIREMENTS DOCUMENT (PRD) v2.0
# STATIC POS SYSTEM (JAMSTACK) — Revisi & Penyempurnaan

**Status:** 🟢 Ready for Development
**Target Platform:** Web (Mobile-First / PWA)
**Deployment:** GitHub Pages + GitHub Actions
**Tech Stack:** Astro, Tailwind CSS, Supabase (DB & Auth), Dexie.js (IndexedDB), Web Bluetooth API, Pagefind

> **Catatan revisi:** Versi ini memperbaiki beberapa kelemahan teknis pada draf sebelumnya:
> 1. Konflik arsitektur antara Pagefind (statis, build-time) vs katalog produk (dinamis, live) — sekarang dipisah jadi dua sistem pencarian.
> 2. RLS yang tidak lengkap (rawan spoofing `user_id` saat INSERT).
> 3. Tidak ada strategi resolusi konflik sinkronisasi offline → online.
> 4. Tidak ada penanganan race condition stok saat multi-device offline.
> 5. Ditambahkan NFR (Non-Functional Requirements), struktur proyek, dan strategi testing yang sebelumnya tidak ada.

---

## 1. Pendahuluan & Objektif

Tujuan proyek ini adalah membangun sistem POS profesional dengan biaya operasional server **nol (zero-cost)**, tetap berfungsi **offline-first**, dan melakukan sinkronisasi otomatis saat koneksi tersedia.

### 1.1 Metrik Keberhasilan (KPIs)

| Metrik | Target |
|---|---|
| Google Lighthouse — Performance | > 90 |
| Google Lighthouse — PWA | > 90 |
| Transaksi offline tanpa gagal | 100% tersimpan lokal |
| Waktu pencarian produk (client-side) | < 100ms |
| Sinkronisasi data setelah online kembali | < 5 detik untuk 100 transaksi |
| Zero duplicate transaction setelah sync | 100% (divalidasi via UUID + idempotency) |

### 1.2 Batasan yang Harus Disadari Sejak Awal

- **Pagefind hanya mengindeks konten statis saat build.** Karena katalog produk berubah secara dinamis lewat Supabase, Pagefind **tidak cocok** untuk pencarian produk real-time. Pagefind lebih tepat untuk pencarian dokumentasi/halaman bantuan yang jarang berubah. Untuk pencarian produk, gunakan **pencarian in-memory di sisi klien** terhadap data yang sudah di-cache di Dexie.js (lihat §3, F02).
- **GitHub Pages tidak mendukung environment secrets di runtime** — kunci `PUBLIC_SUPABASE_ANON_KEY` akan ter-embed di bundle JS publik. Ini **aman selama RLS dikonfigurasi benar**, tapi harus eksplisit didokumentasikan agar tidak dianggap kebocoran kredensial.

---

## 2. Arsitektur Sistem (Technical Stack)

Arsitektur **Jamstack** murni tanpa backend runtime tradisional:

- **Frontend:** Astro (SSG) + Astro Islands untuk komponen interaktif (cart, dashboard).
- **Database & Auth:** Supabase (PostgreSQL) — akses langsung dari klien via SDK, diamankan RLS.
- **Penyimpanan Lokal:** Dexie.js (wrapper IndexedDB) sebagai **sumber kebenaran utama** saat offline.
- **Sinkronisasi:** Custom sync engine (lihat §5) — bukan bawaan Supabase Realtime, karena butuh antrean tulis offline.
- **Hardware:** Web Bluetooth API + encoder ESC/POS (library JS murni; WASM opsional hanya untuk konversi logo ke bitmap monokrom).
- **Pencarian Produk:** In-memory filter/fuzzy-search (mis. Fuse.js) terhadap data Dexie.js — **bukan** Pagefind.
- **Pencarian Dokumentasi/Bantuan (opsional):** Pagefind, khusus untuk halaman statis seperti panduan penggunaan.
- **State Management:** Nano Stores (ringan, kompatibel Astro Islands) untuk state keranjang & sesi.

### 2.1 Diagram Alur Data (ringkas)

```
[UI Astro Island] <-> [Dexie.js/IndexedDB] <-> [Sync Engine] <-> [Supabase (Postgres + RLS)]
                              ^
                              |
                  [Service Worker: cache aset + queue]
```

---

## 3. Kebutuhan Fungsional (Functional Requirements)

| ID | Fitur | Deskripsi Teknis | Kriteria Penerimaan |
|---|---|---|---|
| **F01** | Otentikasi Toko | Login/Daftar via Supabase Auth (Email/Magic Link). Sesi disimpan di `localStorage` terenkripsi SDK. | User hanya bisa akses data miliknya sendiri, divalidasi RLS pada SELECT **dan** INSERT/UPDATE. |
| **F02** | Katalog & Pencarian | Manajemen produk (nama, harga, stok, SKU/barcode). Produk di-cache penuh ke Dexie.js saat login/online. Pencarian dilakukan in-memory (Fuse.js) terhadap cache lokal. | Pencarian < 100ms, berfungsi penuh offline, tidak memanggil Supabase per keystroke. |
| **F03** | Keranjang Belanja | Tambah produk, hitung diskon/pajak/total secara reaktif di klien (Nano Stores). Validasi stok terhadap cache lokal sebelum checkout. | Perhitungan akurat hingga 2 desimal (gunakan tipe `numeric`, hindari floating point JS untuk uang — gunakan integer sen/rupiah penuh). |
| **F04** | Offline Mode (PWA) | Service Worker (Workbox) untuk cache aset statis (cache-first) dan cache API GET (stale-while-revalidate). Transaksi ditulis ke Dexie.js dengan status `pending_sync`. | Checkout tetap berfungsi saat `navigator.onLine === false`; transaksi tersimpan dengan UUID lokal. |
| **F05** | Sync Otomatis | Background sync (Workbox Background Sync / polling saat `online` event) mengirim transaksi `pending_sync` ke Supabase via `upsert` dengan UUID sebagai konflik key. | Tidak ada duplikasi; transaksi gagal sync ditandai `sync_error` dan di-retry dengan backoff eksponensial. |
| **F06** | Resolusi Konflik Stok | Saat sync, stok tidak dikurangi berdasarkan snapshot lama, melainkan via RPC atomik (`decrement_stock`) di Supabase yang memvalidasi stok tersedia server-side. | Jika stok tidak cukup saat sync (karena penjualan ganda di device lain), transaksi ditandai `needs_review`, bukan gagal total. |
| **F07** | Bluetooth Printing | Koneksi ke printer thermal via `navigator.bluetooth.requestDevice`, kirim buffer ESC/POS. | Muncul Bluetooth picker; cetak berhasil; ada fallback pesan error jika Web Bluetooth tidak didukung browser (mis. Safari iOS). |
| **F08** | Manajemen Peran (baru) | Role `owner` dan `cashier` dalam tabel `profiles`. Cashier tidak bisa mengubah harga produk atau melihat laporan penjualan gabungan. | RLS membatasi akses kolom sensitif berdasarkan role. |
| **F09** | Riwayat & Laporan | Daftar transaksi dengan filter tanggal, total penjualan harian. Query langsung ke Supabase saat online; fallback ke Dexie.js saat offline (data lokal saja). | Laporan online menampilkan data lintas-device; laporan offline diberi label "data lokal, belum tentu lengkap". |

---

## 4. Skema Database (Supabase / PostgreSQL) — Diperbaiki

```sql
-- Ekstensi
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabel Profil Toko
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  store_name text NOT NULL,
  address text,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'cashier')),
  owner_id uuid REFERENCES profiles(id), -- null jika owner, terisi jika cashier
  updated_at timestamptz DEFAULT now()
);

-- Tabel Produk
CREATE TABLE products (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  sku text,
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE UNIQUE INDEX idx_products_sku_per_user ON products(user_id, sku) WHERE sku IS NOT NULL;

-- Tabel Transaksi
CREATE TABLE transactions (
  id uuid NOT NULL PRIMARY KEY, -- UUID dibuat di KLIEN (offline), bukan default server
  user_id uuid NOT NULL REFERENCES auth.users(id),
  cashier_id uuid REFERENCES auth.users(id),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  items jsonb NOT NULL,
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'needs_review')),
  client_created_at timestamptz NOT NULL, -- waktu asli transaksi terjadi (offline)
  created_at timestamptz DEFAULT now() -- waktu masuk ke server
);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, client_created_at DESC);

-- RLS: Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_products" ON products
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_products" ON products
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_products" ON products
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_products" ON products
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: Transactions (cashier boleh insert, hanya owner boleh lihat semua & delete)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = cashier_id);
CREATE POLICY "insert_own_transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = cashier_id);

-- RPC: pengurangan stok atomik (mencegah race condition)
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_qty int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_stock int;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_product_id FOR UPDATE;
  IF current_stock IS NULL OR current_stock < p_qty THEN
    RETURN false; -- stok tidak cukup, panggil tandai transaksi needs_review
  END IF;
  UPDATE products SET stock = stock - p_qty WHERE id = p_product_id;
  RETURN true;
END;
$$;
```

**Perubahan penting dari versi sebelumnya:**
- `WITH CHECK` ditambahkan di semua policy INSERT/UPDATE — sebelumnya hanya `USING`, yang berarti user bisa insert data dengan `user_id` milik orang lain.
- `transactions.id` sekarang wajib dikirim dari klien (dibuat saat offline) — dipakai untuk `upsert` idempoten agar sync ulang tidak duplikat.
- Uang disimpan sebagai `numeric(12,2)`, bukan `numeric` tanpa presisi.
- Stok dikurangi lewat RPC atomik `decrement_stock`, bukan `UPDATE ... SET stock = stock - x` langsung dari klien, untuk mencegah race condition antar-device.

---

## 5. Strategi Sinkronisasi Offline → Online (baru, sebelumnya tidak ada)

1. Semua transaksi ditulis dulu ke Dexie.js dengan `sync_status: 'pending'` dan `id` UUID v4 dibuat di klien.
2. Saat event `online` terdeteksi (atau tiap 30 detik jika online), sync engine mengambil semua transaksi `pending` secara berurutan (FIFO by `client_created_at`).
3. Untuk tiap transaksi:
   a. Panggil RPC `decrement_stock` untuk tiap item.
   b. Jika semua sukses → `upsert` transaksi ke tabel `transactions`, tandai lokal sebagai `synced`.
   c. Jika stok kurang → tetap `upsert` transaksi tapi dengan `sync_status: 'needs_review'`, munculkan notifikasi ke owner untuk verifikasi manual (bukan menolak transaksi, karena barang sudah terlanjur terjual di kasir).
4. Retry dengan exponential backoff (1s, 2s, 4s... maks 5 percobaan) jika gagal karena jaringan, bukan karena validasi data.

---

## 6. Alur Kerja Hardware (ESC/POS via Web Bluetooth)

1. **Feature detection dulu:** cek `'bluetooth' in navigator` — jika tidak ada (mis. Safari/iOS), tampilkan pesan fallback "gunakan Chrome/Edge Android" atau opsikan cetak via AirPrint/PDF.
2. **Request Device:** `navigator.bluetooth.requestDevice` dengan filter servis `000018f0-0000-1000-8000-00805f9b34fb`.
3. **Formatting:** Encode data transaksi ke ESC/POS byte array menggunakan library JS (mis. `esc-pos-encoder`).
4. **WASM (opsional):** hanya dipakai untuk dithering logo toko menjadi bitmap 1-bit agar tajam saat dicetak — bukan untuk seluruh proses printing.
5. **Error handling:** Tangani `GATTServerDisconnectedError` dan `NotFoundError` (user membatalkan pairing) dengan pesan yang jelas, dan simpan status "gagal cetak" agar bisa dicetak ulang manual.

---

## 7. Non-Functional Requirements (baru, sebelumnya tidak ada)

- **Keamanan:** RLS wajib untuk semua tabel; anon key boleh publik karena bukan sumber otorisasi. Rate limiting login via Supabase Auth bawaan.
- **Aksesibilitas:** Kontras warna WCAG AA minimum, tombol checkout dapat dioperasikan via keyboard/tab untuk kasir yang pakai scanner barcode eksternal.
- **Kompatibilitas Browser:** Wajib Chrome/Edge (Web Bluetooth). Safari/Firefox didukung untuk semua fitur kecuali printing Bluetooth.
- **Testing:**
  - Unit test kalkulasi keranjang & diskon (Vitest).
  - Integration test RLS policy (via Supabase local + pgTAP atau test client dengan 2 user berbeda).
  - E2E test alur offline→online (Playwright, dengan network throttling/offline mode).
- **Observability:** Log error sync ke tabel `sync_logs` sederhana agar owner bisa audit transaksi yang gagal sync.

---

## 8. Struktur Proyek (baru, sebelumnya tidak ada)

```
/src
  /components      # Astro components (UI statis)
  /islands         # Komponen interaktif (React/Preact untuk Astro Islands)
  /lib
    /db.ts         # Setup Dexie.js schema
    /supabase.ts   # Supabase client
    /sync.ts       # Sync engine
    /printer.ts    # Web Bluetooth + ESC/POS
    /search.ts     # Fuse.js in-memory search
  /pages
  /stores          # Nano Stores (cart, session)
/public
  /sw.js           # Service worker (Workbox)
supabase/
  /migrations      # SQL migrations
.github/workflows/deploy.yml
```

---

## 9. Alur Deployment (GitHub Actions)

- **Trigger:** Push ke branch `main`.
- **Environment:** Injeksi `PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_ANON_KEY` dari GitHub Secrets saat build (bukan runtime).
- **Build:** `npm run build` → kompresi gambar, generate service worker, (opsional) index Pagefind untuk halaman bantuan.
- **Deploy:** Publikasi `./dist` ke GitHub Pages.
- **Tambahan:** Jalankan `npm run test` sebagai gate sebelum deploy — build gagal jika test gagal.

---

## 10. Arahan Prompting untuk Claude Code (diperbarui)

> *"Claude, bangun proyek POS Statis berdasarkan PRD v2.0 ini. Urutan wajib:*
> *1. Inisialisasi Astro + Tailwind CSS.*
> *2. Setup Supabase client-side SDK dan jalankan migrasi SQL di §4 (termasuk RLS dan RPC `decrement_stock`).*
> *3. Setup Dexie.js schema untuk products, transactions (dengan field `sync_status`), dan cart.*
> *4. Bangun Astro Island untuk keranjang belanja dengan Nano Stores, pencarian produk pakai Fuse.js terhadap cache Dexie — JANGAN pakai Pagefind untuk pencarian produk.*
> *5. Implementasikan sync engine sesuai §5 sebelum menyentuh fitur Bluetooth.*
> *6. Fitur Bluetooth printing (§6) dikerjakan terakhir, dengan feature detection dan fallback wajib ada.*
> *Jangan lompat urutan — setiap tahap harus lulus test sebelum lanjut ke tahap berikutnya."*

---

## 11. Acceptance Criteria (Final)

- [ ] Login/logout berfungsi tanpa backend server, sesi persisten.
- [ ] Produk baru tersimpan ke Supabase (online) dan Dexie.js secara konsisten.
- [ ] Pencarian produk berfungsi offline, in-memory, < 100ms.
- [ ] Aplikasi ter-install sebagai PWA di Android/iOS dengan icon home screen.
- [ ] Transaksi offline tersimpan lokal dan tersinkronisasi tanpa duplikasi saat online.
- [ ] Race condition stok tertangani lewat RPC atomik, bukan update langsung dari klien.
- [ ] Printer thermal berhasil mencetak struk; ada fallback jelas jika Web Bluetooth tidak tersedia.
- [ ] Pengguna A tidak bisa membaca **atau menulis** data milik Pengguna B, tervalidasi lewat test RLS otomatis (bukan cuma manual).
- [ ] Cashier tidak bisa mengubah harga produk atau melihat laporan gabungan lintas-kasir.
