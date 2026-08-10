# Aplikasi POS Offline — Web App Mobile-First

Membangun POS untuk UMKM sesuai PRD, dijalankan sebagai web app mobile-first yang bekerja penuh offline (semua data tersimpan di perangkat via IndexedDB). Kotlin/Android native tidak tersedia di sini, jadi ini menjadi aplikasi web yang bisa dipasang di layar utama HP.

## Fase 1 (yang dibangun sekarang)

**Fondasi + Manajemen Produk + Kasir**

- Struktur data lokal sesuai §3 PRD: Product, Category, Transaction, TransactionItem, StoreSettings, Shift.
- Navigasi bawah: Kasir, Produk, Riwayat, Laporan, Pengaturan (fase berikutnya diisi bertahap).
- **Produk (§4.1):** tambah/ubah/hapus produk (nama, foto, harga jual, HPP opsional, kategori, stok). Stok kosong = unlimited, 0 = habis (badge merah), angka = terbatas. Kelola kategori.
- **Kasir (§4.2):** search produk dengan debounce 300ms, kategori horizontal scroll dengan tab "Semua", kartu produk grid, produk habis abu-abu + label "Stok Habis" dan tidak bisa ditap, keranjang dengan numpad input qty manual, bayar (tunai/lainnya) → transaksi tersimpan dengan snapshot `price_at_sale` & `hpp_at_sale`, stok berkurang otomatis.
- Data seed contoh (beberapa produk & kategori) agar layar langsung terpakai.

## Fase berikutnya (setelah fase 1 disetujui)

- Fase 2 — PIN (§4.3) + Riwayat transaksi & hapus berotorisasi
- Fase 3 — Pengaturan toko & struk (§4.4), preview struk + cetak browser/PDF
- Fase 4 — Laporan & dasbor (§4.5): filter waktu, ringkasan, leaderboard, chart jam & hari sibuk
- Fase 5 — Shift/Tutup kasir (§4.6)
- Fase 6 — Void transaksi (§4.7)
- Fase 7 — Backup & Restore JSON (§4.8)

## Desain

Mobile-first, target satu tangan: tombol besar, angka rupiah tebal dan mudah dibaca, kontras tinggi untuk dipakai di warung dengan cahaya terang. Palet hangat (oranye/amber sebagai aksi utama, netral tanah), bukan gaya SaaS ungu generik. Semua warna sebagai token desain.

## Catatan teknis

- Penyimpanan: IndexedDB melalui satu lapisan repository (`src/lib/db/`), tanpa server/akun. Penulisan transaksi atomik dalam satu IndexedDB transaction agar tidak korup saat app ditutup mendadak.
- Foto produk disimpan sebagai blob/data URL di IndexedDB, dirujuk lewat id.
- Semua akses IndexedDB dijalankan client-side saja (aman terhadap SSR).
- Uang disimpan sebagai integer rupiah, tidak ada floating point.
- Cetak struk Bluetooth ESC/POS tidak mungkin di web — diganti preview struk + dialog cetak browser (bisa disimpan PDF).
