# Audit Pembaruan GitHub + Fase v1.1 (Diskon & Stok Menipis)

## Hasil audit commit terakhir ("Diskon item & transaksi: plumbing backend + numpad presets")

Yang sudah benar:
- `checkout()` sudah menerima diskon per item (persen) dan diskon transaksi, menghitung omset net, `discount_total`, dan laba net (`net - hpp`, lalu dikurangi diskon transaksi).
- `TransactionItem.discount_percent` di-snapshot saat penjualan, jadi riwayat tidak berubah bila harga produk diedit.
- Numpad sudah mendukung tombol preset persen dan pesan "Melebihi batas".
- Halaman Kasir sudah menghitung subtotal, diskon item, diskon transaksi, dan total akhir dengan benar.

Yang belum selesai (backend ada, UI belum tersambung):
- `discountFor`, `txDiscOpen`, dan `setStoreDiscount` di halaman Kasir dideklarasikan tapi tidak pernah dipakai di tampilan — belum ada tombol diskon per item maupun diskon transaksi, sehingga fitur diskon belum bisa dipakai kasir sama sekali (dan memicu peringatan variabel tak terpakai).
- Struk, halaman Riwayat, dan Laporan belum menampilkan diskon sama sekali.
- `low_stock_threshold` sudah ada di tipe Produk dan Pengaturan (default 5), tetapi belum ada UI pengaturan maupun penanda stok menipis di manapun.

## Yang akan dikerjakan

### 1. Selesaikan fitur Diskon (PRD §5 — diskon per item & per transaksi)
- Tiap baris keranjang: tombol persen kecil yang membuka numpad diskon (preset 5/10/15/20/25/50%), menampilkan harga coret + harga net bila diskon > 0.
- Ringkasan keranjang: baris Subtotal, Diskon item, Diskon transaksi (tombol untuk mengatur persen), dan Total akhir.
- Struk: baris subtotal + total diskon, dan tanda diskon pada item yang didiskon.
- Riwayat detail transaksi: tampilkan diskon per item dan total diskon.
- Laporan: kartu tambahan "Total Diskon" pada rentang periode terpilih.

### 2. Notifikasi Stok Menipis (PRD §5)
- Pengaturan: input ambang stok menipis global (default 5).
- Produk & Kasir: badge kuning "Stok menipis" saat `0 < stok <= ambang` (badge merah "Stok Habis" tetap).
- Halaman Produk: banner ringkas berisi jumlah produk yang perlu di-restock, dengan filter cepat "Stok menipis".

## Catatan teknis
- Semua perhitungan diskon tetap di `checkout()` (`src/lib/db/pos-db.ts`) — UI hanya mengirim persen; tidak ada duplikasi logika uang.
- Ambang per produk memakai `product.low_stock_threshold`, fallback ke `settings.low_stock_threshold ?? 5`.
- Transaksi lama tanpa `discount_total` diperlakukan sebagai 0 (opsional pada tipe), jadi data lama tetap terbaca.
- Tidak ada perubahan skema IndexedDB; hanya field opsional yang sudah terdefinisi.
