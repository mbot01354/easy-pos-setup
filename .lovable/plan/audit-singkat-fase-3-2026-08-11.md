# Audit Singkat + Fase 3

## Hasil audit
- Scrollbar tersembunyi global, keranjang sticky header/footer, stok default 0 dengan opsi "tidak terbatas" — semua sudah terpasang.
- Riwayat transaksi (grup tanggal, filter, detail, hapus + kembalikan stok) berjalan.
- Bug PIN sudah diperbaiki: input direset setiap dialog dibuka/berganti langkah, jadi konfirmasi tidak lagi menumpuk digit.
- Sisa placeholder: halaman Laporan dan sebagian Pengaturan.

Tidak ada kendala yang menghalangi lanjut.

## Fase 3 — Laporan & Identitas Toko

### 1. Halaman Laporan
- Filter periode: Hari ini, 7 hari, 30 hari, Semua.
- Kartu ringkasan: total omset, total laba, jumlah transaksi, rata-rata per transaksi.
- Penanda bila ada transaksi dengan HPP belum diisi (laba tidak akurat).
- Produk terlaris: 5 besar berdasarkan qty, dengan kontribusi omset.
- Grafik jam sibuk (bar sederhana per jam) dan ringkasan per hari.

### 2. Pengaturan — identitas toko
- Form nama toko, jenis usaha, dan logo (unggah gambar, disimpan sebagai data URL).
- Tersimpan di store `settings` yang sudah ada.

### 3. Struk
- Setelah pembayaran di kasir, tombol "Lihat struk" membuka pratinjau struk: logo, nama toko, tanggal, daftar item, total, metode bayar.
- Tombol cetak memakai print browser (bisa disimpan sebagai PDF).
- Struk juga bisa dibuka ulang dari detail transaksi di Riwayat.

### 4. Backup & Restore
- Ekspor seluruh data (produk, kategori, transaksi, item, pengaturan) ke file JSON.
- Impor file JSON dengan konfirmasi timpa data, dilindungi PIN bila PIN aktif.

## Catatan teknis
- Agregasi laporan dihitung di client dari IndexedDB (`listTransactions` + item), memakai React Query dengan key per periode.
- Tambah helper `listAllTransactionItems()` di `pos-db.ts` untuk agregasi produk terlaris tanpa N+1 query.
- Struk sebagai komponen `src/components/pos/ReceiptDialog.tsx` dengan CSS `@media print` agar hanya area struk yang tercetak.
- Backup/restore lewat fungsi `exportAll()` / `importAll()` di `pos-db.ts`, impor dalam satu transaksi IndexedDB agar atomik.
- Semua tetap offline, tanpa backend.
