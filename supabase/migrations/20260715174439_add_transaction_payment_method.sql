alter table transactions add column payment_method text not null default 'cash' check (payment_method in ('cash', 'qris'));
