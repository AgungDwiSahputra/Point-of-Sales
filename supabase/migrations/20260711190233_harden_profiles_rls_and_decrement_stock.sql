-- Migrasi awal tidak mengaktifkan RLS pada profiles sama sekali (celah keamanan),
-- dan decrement_stock tidak memvalidasi bahwa pemanggil benar-benar berhak atas produk tsb
-- (owner produk, atau cashier dari toko itu). Migrasi ini menutup keduanya.

alter table profiles enable row level security;

create policy "select_own_or_managed_profiles" on profiles
  for select using (auth.uid() = id or owner_id = auth.uid());

create policy "insert_own_profile" on profiles
  for insert with check (auth.uid() = id);

create policy "update_own_profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function decrement_stock(p_product_id uuid, p_qty integer)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  current_stock int;
  product_owner uuid;
  caller_owner uuid;
begin
  select stock, user_id into current_stock, product_owner
  from products where id = p_product_id for update;

  if current_stock is null then
    return false; -- produk tidak ditemukan
  end if;

  select owner_id into caller_owner from profiles where id = auth.uid();

  if auth.uid() is distinct from product_owner and caller_owner is distinct from product_owner then
    return false; -- caller bukan owner produk ini, dan bukan cashier dari toko tsb
  end if;

  if current_stock < p_qty then
    return false; -- stok tidak cukup
  end if;

  update products set stock = stock - p_qty where id = p_product_id;
  return true;
end;
$$;
