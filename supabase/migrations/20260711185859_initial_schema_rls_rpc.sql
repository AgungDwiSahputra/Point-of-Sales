-- Skema awal: profiles, products, transactions + RLS (products/transactions) + RPC decrement_stock.
-- Lihat docs/PRD_POS_Static_Jamstack_v2.md §4 untuk rasionalnya.

create extension if not exists "uuid-ossp";

create table profiles (
  id uuid references auth.users on delete cascade primary key,
  store_name text not null,
  address text,
  role text not null default 'owner' check (role in ('owner', 'cashier')),
  owner_id uuid references profiles(id), -- null jika owner, terisi jika cashier
  updated_at timestamptz default now()
);

create table products (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  sku text,
  stock int not null default 0 check (stock >= 0),
  is_active boolean default true,
  updated_at timestamptz default now()
);
create index idx_products_user_id on products(user_id);
create unique index idx_products_sku_per_user on products(user_id, sku) where sku is not null;

create table transactions (
  id uuid not null primary key, -- uuid dibuat di klien (offline), bukan default server
  user_id uuid not null references auth.users(id),
  cashier_id uuid references auth.users(id),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  items jsonb not null,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'needs_review')),
  client_created_at timestamptz not null,
  created_at timestamptz default now()
);
create index idx_transactions_user_created on transactions(user_id, client_created_at desc);

-- RLS: Products
alter table products enable row level security;
create policy "select_own_products" on products
  for select using (auth.uid() = user_id);
create policy "insert_own_products" on products
  for insert with check (auth.uid() = user_id);
create policy "update_own_products" on products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own_products" on products
  for delete using (auth.uid() = user_id);

-- RLS: Transactions (cashier boleh insert, hanya owner atau cashier yang bersangkutan boleh lihat)
alter table transactions enable row level security;
create policy "select_own_transactions" on transactions
  for select using (auth.uid() = user_id or auth.uid() = cashier_id);
create policy "insert_own_transactions" on transactions
  for insert with check (auth.uid() = user_id or auth.uid() = cashier_id);

-- RPC: pengurangan stok atomik (mencegah race condition)
create or replace function decrement_stock(p_product_id uuid, p_qty int)
returns boolean
language plpgsql security definer as $$
declare
  current_stock int;
begin
  select stock into current_stock from products where id = p_product_id for update;
  if current_stock is null or current_stock < p_qty then
    return false; -- stok tidak cukup, panggil tandai transaksi needs_review
  end if;
  update products set stock = stock - p_qty where id = p_product_id;
  return true;
end;
$$;
