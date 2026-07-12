alter table transactions add column discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0);
alter table transactions add column shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0);
