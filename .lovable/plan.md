# Perbaikan UI + Fase 2 (Riwayat & PIN)

## 1. Sembunyikan garis scrollbar (tetap bisa di-scroll)

- Tambah utility global di `src/styles.css` (`@utility no-scrollbar`) yang menyembunyikan scrollbar di WebKit dan Firefox, lalu terapkan pada body/area scroll utama dan strip kategori horizontal di Kasir.
- Scroll tetap berfungsi normal (touch, wheel, keyboard).

## 2. Panel keranjang: sticky header & footer

Ubah sheet keranjang di Kasir menjadi 3 bagian dengan tinggi tetap:

```text
┌──────────────────────────┐
│ Header: "Keranjang" + X  │  sticky atas
├──────────────────────────┤
│ Daftar item (scroll)     │  area scroll, scrollbar disembunyikan
├──────────────────────────┤
│ Total + tombol bayar     │  sticky bawah
└──────────────────────────┘
```

- Hanya daftar item yang bergulir; total dan tombol Bayar Tunai / Non-Tunai selalu terlihat.
- Tambah state kosong ("Keranjang masih kosong") agar panel tidak terlihat rusak.

## 3. Stok kosong = 0 (bukan tanpa batas)

- Di form produk, field stok yang dibiarkan kosong disimpan sebagai `0` (habis), bukan `null`.
- Untuk produk tanpa batas stok, disediakan checkbox eksplisit "Stok tidak terbatas".
- Data seed contoh disesuaikan supaya konsisten.

## 4. Fase 2 — Riwayat Transaksi + PIN

**Halaman Riwayat (`/riwayat`)**

- Daftar transaksi terbaru dikelompokkan per tanggal: jam, jumlah item, metode bayar, total omset.
- Tap transaksi → detail: rincian item, harga saat jual, total, laba.
- Filter cepat: Hari ini / 7 hari / Semua.
- Hapus transaksi butuh PIN; stok produk dikembalikan saat penghapusan (atomik dalam satu transaksi database lokal).

**PIN (§4.3)**

- Di Pengaturan: buat/ubah PIN 4-6 digit, disimpan sebagai hash + salt (SHA-256 Web Crypto), bukan teks polos.
- Dialog numpad PIN dipakai untuk aksi sensitif (hapus transaksi). Jika PIN belum dibuat, pengguna diarahkan membuatnya dulu.

## Catatan teknis

- Semua tetap offline via IndexedDB, tanpa server.
- Penghapusan transaksi memakai satu IndexedDB transaction (hapus transaksi + item + kembalikan stok) agar tidak korup.
- PIN hash: SHA-256 dari `salt + pin`, salt acak per perangkat; disimpan di store `settings`.
