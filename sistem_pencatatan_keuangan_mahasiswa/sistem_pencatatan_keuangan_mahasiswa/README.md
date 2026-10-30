# Sistem Pencatatan Keuangan Mahasiswa

Website pencatatan transaksi dengan login Supabase dan kebijakan Row Level Security untuk membatasi transaksi ke pemiliknya.

## Menyiapkan Supabase

1. Buat proyek di Supabase.
2. Buka **SQL Editor**, lalu jalankan isi `supabase/schema.sql` untuk membuat tabel dan kebijakan akses.
3. Dari pengaturan API proyek, salin **Project URL** dan **publishable key**.
4. Ganti nilai placeholder `supabaseUrl` dan `supabasePublishableKey` di `supabase-config.js`.
   Gunakan publishable key (atau legacy `anon` key), bukan `service_role` key. Nilai ini digunakan di browser; keamanan data ditangani oleh RLS.
5. Pada Authentication, sesuaikan pengaturan konfirmasi email dengan kebutuhan. Jika konfirmasi email aktif, pengguna harus mengonfirmasi alamatnya sebelum masuk.

## Menjalankan

Buka folder ini di Visual Studio Code dan jalankan `index.html` melalui ekstensi Live Server. Jangan membukanya langsung dengan URL `file://` karena modul JavaScript dan permintaan Supabase perlu origin HTTP.

Pengguna dapat mendaftar atau masuk dengan email dan password. Transaksi baru dan riwayat disimpan di Supabase; kolom `user_id` otomatis diisi dari sesi login dan RLS membatasi akses tiap pengguna.
