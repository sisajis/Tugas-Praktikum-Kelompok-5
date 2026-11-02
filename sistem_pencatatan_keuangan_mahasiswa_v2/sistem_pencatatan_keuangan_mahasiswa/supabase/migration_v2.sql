-- Migrasi v2: menambah jenis transaksi 'saving' (nabung) dan 'withdraw' (tarik tabungan).
--
-- Jalankan HANYA jika tabel public.transactions sudah dibuat dengan schema versi lama.
-- Untuk proyek baru cukup jalankan supabase/schema.sql.
-- Aman dijalankan berulang kali dan tidak menghapus data transaksi.

do $$
declare
  old_constraint record;
begin
  -- Hapus aturan lama yang hanya mengizinkan 'income' dan 'expense'
  for old_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%income%'
  loop
    execute format(
      'alter table public.transactions drop constraint %I',
      old_constraint.conname
    );
  end loop;
end
$$;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('income', 'expense', 'saving', 'withdraw'));
