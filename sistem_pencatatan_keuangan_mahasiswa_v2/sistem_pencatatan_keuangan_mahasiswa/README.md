# Sistem Pencatatan Keuangan Mahasiswa

Website pencatatan keuangan dengan login Supabase dan Row Level Security (setiap pengguna hanya bisa mengakses transaksinya sendiri). Tampilan mengikuti gaya aplikasi mobile: kartu saldo biru, menu ubin, dan navigasi bawah, serta tetap nyaman di laptop.

## Fitur

**Dashboard (Beranda)**
- Saldo saat ini, pemasukan total, pengeluaran total, dan total tabungan.
- Rekap per bulan (pemasukan, pengeluaran, tabungan) dengan panah untuk pindah bulan.
- Anggaran bulanan dengan bar progres, grafik arus kas harian, dan 5 transaksi terbaru.
- Menu pilihan: Masuk Saldo, Pengeluaran, Nabung, Riwayat Transaksi, Akumulasi, Aktivitas, Cetak Laporan, Pengaturan.
- Tombol tema terang/gelap dan notifikasi (anggaran hampir/telah terlampaui, saldo negatif, belum ada catatan hari ini).

**Akumulasi**
- *Per Tanggal*: total pemasukan, pengeluaran, dan tabungan tiap tanggal dalam satu bulan, plus **saldo akhir hari** yang dihitung dari saldo awal bulan. Ketuk tanggal untuk melihat rincian transaksinya; centang "Semua tanggal" untuk menampilkan tanggal tanpa transaksi.
- *Per Bulan*: akumulasi Januari sampai Desember pada tahun terpilih dengan saldo akhir tiap bulan. Ketuk nama bulan untuk melompat ke rincian per tanggalnya.

**Transaksi**
- Empat jenis: Pemasukan, Pengeluaran, Nabung, dan Tarik Tabungan.
- Ubah dan hapus transaksi (dengan konfirmasi), saran kategori, dan pratinjau nominal.
- Riwayat dikelompokkan per tanggal dengan filter bulan, jenis, dan pencarian.

**Aktivitas**: rata-rata pengeluaran per hari, hari paling boros, kategori terbesar, rasio menabung, grafik harian, pengeluaran per kategori, dan tren 12 bulan.

**Cetak Laporan** (bulanan atau tahunan): dokumen Word (.doc), berkas CSV untuk Excel/Sheets, atau cetak/simpan PDF.

**Pengaturan**: nama tampilan, anggaran bulanan, tema, dan keluar.

## Aturan saldo

```
saldo          = pemasukan - pengeluaran - menabung + tarik tabungan
total tabungan = menabung - tarik tabungan
```

Uang yang ditabung keluar dari saldo dan masuk ke total tabungan. Tarik tabungan mengembalikannya ke saldo dan tidak bisa melebihi total tabungan.

## Menyiapkan Supabase

1. Buat proyek di Supabase.
2. **Proyek baru**: buka **SQL Editor**, lalu jalankan `supabase/schema.sql`.
   **Sudah punya tabel dari versi sebelumnya**: jalankan `supabase/migration_v2.sql` saja. Berkas ini menambah jenis `saving` dan `withdraw`, aman dijalankan berulang, dan tidak menghapus data.
3. Dari pengaturan API proyek, salin **Project URL** dan **publishable key**.
4. Isi `supabaseUrl` dan `supabasePublishableKey` di `supabase-config.js`. Gunakan publishable key (atau legacy `anon` key), bukan `service_role`. Nilai ini dipakai di browser; keamanan data ditangani oleh RLS.
5. Pada Authentication, sesuaikan konfirmasi email dengan kebutuhan.

> Tanpa langkah migrasi, transaksi **Nabung** dan **Tarik Tabungan** akan ditolak database dan aplikasi menampilkan petunjuk untuk menjalankan `migration_v2.sql`. Pemasukan dan pengeluaran tetap berjalan.

## Menjalankan

Buka folder ini di Visual Studio Code dan jalankan `index.html` melalui ekstensi Live Server. Jangan membukanya dengan `file://` karena modul JavaScript dan permintaan Supabase memerlukan origin HTTP.

## Pengujian

Logika perhitungan (akumulasi, saldo, validasi, ekspor) dipisahkan dari tampilan sehingga bisa diuji tanpa browser. Perlu Node.js 18 atau lebih baru:

```
npm test
```

Bukti pengujian sebelumnya tetap ada di `docs/evidence/`.

## Struktur berkas

```
index.html            kerangka halaman (login, beranda, dan semua halaman)
styles.css            tampilan, tema terang/gelap, gaya cetak
script.js             alur utama: login, navigasi, data, dan tampilan
supabase-config.js    URL dan key Supabase
src/aggregate.js      perhitungan akumulasi, saldo, wawasan, anggaran
src/validation.js     validasi input transaksi dan anggaran
src/charts.js         grafik SVG tanpa library
src/export.js         laporan Word, CSV, dan cetak
src/utils.js          format rupiah, tanggal Indonesia, pembuat elemen DOM
src/icons.js          ikon SVG
tests/                pengujian otomatis (node:test)
supabase/             schema.sql dan migration_v2.sql
```

## Catatan teknis

- Nama tampilan dan anggaran bulanan disimpan di `user_metadata` akun Supabase, sehingga ikut tersinkron antarperangkat tanpa tabel tambahan. Pilihan tema disimpan di browser.
- Data diambil per 1000 baris karena Supabase membatasi satu permintaan, sehingga saldo tetap benar untuk data yang banyak.
- File CSV memakai pemisah titik koma agar langsung rapi di Excel berlokal Indonesia. Teks yang diawali `=`, `+`, `-`, atau `@` diberi apostrof agar tidak dibaca sebagai rumus.
- File Word dibuat dari HTML berformat `.doc`. Word kadang menampilkan pesan format saat dibuka; pilih "Ya" untuk melanjutkan.
