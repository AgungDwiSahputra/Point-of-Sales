alter table transactions add column voided_at timestamptz;
alter table transactions add column voided_by uuid references auth.users(id);

-- Soft-cancel standar POS: bukan hapus/ubah data transaksi, hanya menandai batal + kembalikan stok.
-- SECURITY DEFINER supaya tidak perlu RLS UPDATE terbuka di tabel transactions (yang bisa jadi celah
-- utk mengubah total_amount/items secara bebas) - satu-satunya jalur ubah baris ini ya lewat fungsi ini.
create or replace function void_transaction(p_transaction_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  tx record;
  caller_owner uuid;
  item record;
begin
  select * into tx from transactions where id = p_transaction_id for update;

  if tx is null then
    return false; -- transaksi tidak ditemukan
  end if;

  if tx.voided_at is not null then
    return false; -- sudah dibatalkan sebelumnya - jangan kembalikan stok dua kali
  end if;

  select owner_id into caller_owner from profiles where id = auth.uid();

  if auth.uid() is distinct from tx.user_id and caller_owner is distinct from tx.user_id then
    return false; -- caller bukan owner toko ini, dan bukan kasir dari toko ini
  end if;

  for item in select * from jsonb_to_recordset(tx.items) as x(product_id uuid, qty int)
  loop
    update products set stock = stock + item.qty where id = item.product_id;
  end loop;

  update transactions set voided_at = now(), voided_by = auth.uid() where id = p_transaction_id;

  return true;
end;
$$;
