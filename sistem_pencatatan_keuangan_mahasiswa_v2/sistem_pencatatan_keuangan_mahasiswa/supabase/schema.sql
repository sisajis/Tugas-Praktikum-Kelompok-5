create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- income = pemasukan, expense = pengeluaran,
  -- saving = menabung (uang keluar dari saldo ke tabungan),
  -- withdraw = tarik tabungan (uang kembali ke saldo)
  type text not null check (type in ('income', 'expense', 'saving', 'withdraw')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (char_length(trim(category)) > 0),
  transaction_date date not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, created_at desc);

alter table public.transactions enable row level security;

create policy "Users can read their own transactions"
  on public.transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own transactions"
  on public.transactions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own transactions"
  on public.transactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own transactions"
  on public.transactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
