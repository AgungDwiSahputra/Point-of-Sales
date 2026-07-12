-- NFR Observability: catat error sync ke tabel ini agar owner bisa audit transaksi yang gagal sync,
-- alih-alih hanya tercatat lokal di Dexie (sync_error_message) yang tidak terlihat owner dari device lain.

create table sync_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id),
  transaction_id uuid, -- referensi longgar ke transactions.id; boleh null kalau transaksinya sendiri gagal tersimpan
  error_message text not null,
  created_at timestamptz default now()
);
create index idx_sync_logs_user_created on sync_logs(user_id, created_at desc);

alter table sync_logs enable row level security;

create policy "select_own_sync_logs" on sync_logs
  for select using (auth.uid() = user_id);

create policy "insert_own_sync_logs" on sync_logs
  for insert with check (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and owner_id = user_id)
  );
