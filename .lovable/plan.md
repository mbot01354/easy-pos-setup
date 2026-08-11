# Fase 4 — Identitas Toko, Struk, dan Cadangan Data

Melanjutkan setelah Kasir, Produk, Riwayat, PIN, dan Laporan selesai.

## 1. Identitas Toko (halaman Pengaturan)
Mengganti blok "Menyusul di fase berikutnya" dengan form nyata:
- Nama toko, jenis usaha, dan logo (unggah gambar, disimpan langsung di perangkat).
- Pratinjau logo dengan tombol hapus.
- Tombol simpan dengan notifikasi berhasil.

## 2. Struk Transaksi
- Komponen struk bergaya kertas 58mm: logo, nama toko, jenis usaha, tanggal/jam, nomor transaksi, daftar item (nama, qty x harga, subtotal), total, metode bayar, dan ucapan terima kasih.
- Dibuka dari halaman Riwayat (detail transaksi) dan langsung setelah pembayaran di halaman Kasir.
- Tombol "Cetak" memakai cetak bawaan browser (bisa disimpan sebagai PDF), dengan gaya khusus cetak agar hanya struk yang tercetak.

## 3. Cadangan & Pulihkan Data
- "Cadangkan": mengunduh satu berkas JSON berisi seluruh produk, kategori, transaksi, item, dan pengaturan (nama berkas memuat tanggal).
- "Pulihkan": memilih berkas JSON, validasi isi, konfirmasi peringatan bahwa data saat ini akan diganti, lalu impor. Dilindungi PIN bila PIN aktif.
- "Hapus semua data" (opsional, dilindungi PIN) untuk mulai dari awal.

## Catatan teknis
- Tambah fungsi `exportAllData()` / `importAllData()` / `clearAllData()` di `src/lib/db/pos-db.ts` memakai satu transaksi IndexedDB agar konsisten.
- Komponen baru: `src/components/pos/ReceiptDialog.tsx` dan `src/components/pos/StoreIdentityForm.tsx`.
- Gaya cetak `@media print` ditambahkan di `src/styles.css` (sembunyikan shell aplikasi, tampilkan area struk saja).
- Logo disimpan sebagai data URL di `store_settings.logo_path`, dikompres/diperkecil sebelum disimpan agar hemat ruang.
- Struktur berkas cadangan: `{ version: 1, exported_at, categories, products, transactions, transaction_items, settings }`.
