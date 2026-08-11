# PRD — Aplikasi POS Offline (Mobile)

**Dokumen untuk:** coding agent (opencode, Kilo, Hermes, Antigravity, atau agent sejenis)
**Platform:** Mobile (Android prioritas; iOS opsional fase lanjut)
**Mode:** Offline-first — semua fitur inti berjalan tanpa koneksi internet
**Status:** Draft v1.0 — siap dieksekusi bertahap

---

## 1. Ringkasan Produk

Aplikasi POS (Point of Sale) untuk UMKM skala kecil-menengah (warung, kedai, jajanan, jasa). Fokus: transaksi cepat, kontrol stok, kontrol kecurangan kasir, dan laporan laba yang akurat — semuanya berjalan lokal di perangkat tanpa bergantung server.

**Termasuk v1 (di luar spec awal, ditambahkan karena risiko kehilangan data/uang tinggi untuk app offline):**
- Tutup Kasir / Shift
- Void transaksi dengan alasan wajib
- Backup/Restore manual

**Bukan tujuan v1 (non-goals):**
- Sinkronisasi cloud multi-perangkat
- Multi-outlet/multi-cabang
- Pembayaran digital terintegrasi (QRIS otomatis, dsb) — dicatat manual dulu
- Web/desktop dashboard
- Diskon, barcode scanner, notifikasi stok, export PDF/Excel, multi-kasir per-akun, split payment — dicadangkan untuk v1.1 (lihat §5)

---

## 2. Tech Stack Rekomendasi

| Layer | Pilihan | Alasan |
|---|---|---|
| Framework | Kotlin + Jetpack Compose | Ini yang di-generate native oleh Google AI Studio — lanjutkan di stack yang sama, jangan port ke Flutter |
| Database lokal | Room (SQLite) | Standar Android untuk relasi produk-transaksi, type-safe via DAO |
| State management | ViewModel + StateFlow/Compose State | Pola standar Jetpack Compose, boundary jelas per screen saat instruksi ke agent |
| Printer Bluetooth | Android Bluetooth API (RFCOMM) + command ESC/POS, atau lib ESC/POS Android | AI Studio sudah dukung akses Bluetooth native — tinggal integrasi library ESC/POS |
| Penyimpanan gambar | Internal storage (`filesDir`), simpan path di Room, bukan blob | Ringan, cepat query |
| Charting laporan | Compose charting lib (mis. Vico) | Bar chart jam sibuk/hari sibuk, native Compose |
| Auth PIN | Hash PIN (SHA-256 + salt) via `EncryptedSharedPreferences` | Jangan simpan PIN plaintext |

Catatan: rekomendasi sebelumnya (Flutter/drift) sudah tidak berlaku — diganti karena basis kode sekarang lahir dari Google AI Studio yang generate native Kotlin, bukan Flutter. Kalau agent lanjutan (opencode/Kilo/Hermes/Antigravity) mengusulkan stack lain, tetap pertahankan prinsip: **offline-first, relational local DB, no cloud dependency di v1** — dan hindari rewrite total dari Kotlin kecuali ada alasan kuat, karena itu buang kode yang sudah jadi dari AI Studio.

---

## 3. Skema Data (Entities)

```
Product
- id, name, photo_path, sell_price, cost_price(HPP nullable),
  category_id, stock (nullable = unlimited, 0 = habis, >0 = terbatas), is_active

Category
- id, name, sort_order

Transaction
- id, timestamp, cashier_id(optional v1), shift_id, total_omset, total_hpp,
  total_laba, payment_method, status(completed/voided), void_reason(nullable)

TransactionItem
- id, transaction_id, product_id, qty, price_at_sale, hpp_at_sale

StoreSettings
- store_name, business_type, logo_path, pin_hash, pin_salt

Shift
- id, opened_at, closed_at(nullable), opening_cash, closing_cash_system(computed),
  closing_cash_actual(input kasir saat tutup), selisih(computed), status(open/closed)

// v1.1+ (lihat saran fitur)
StockLog
- id, product_id, change_qty, reason(sale/manual_adjust/restock), timestamp
```

Catatan penting: `price_at_sale` dan `hpp_at_sale` di-snapshot saat transaksi terjadi, **bukan** join real-time ke tabel Product — supaya laporan histori tidak berubah kalau harga produk diedit belakangan.

---

## 4. Modul Fitur & Acceptance Criteria

### 4.1 Manajemen Produk
- CRUD produk: nama, foto, harga jual, HPP (opsional), kategori, stok.
- Field stok: kosong = unlimited, 0 = habis (badge merah, tidak bisa ditransaksikan), angka = stok terbatas (berkurang otomatis per transaksi).
- **Selesai ketika:** produk baru langsung muncul di menu kasir tanpa restart app; stok berkurang real-time setelah transaksi sukses; produk stok 0 tidak bisa ditambah ke keranjang.

### 4.2 Kasir / Transaksi
- Search bar produk (filter nama, debounce 300ms).
- Kategori horizontal scrollable, tab "Semua" default aktif.
- Produk stok habis: grayed out + label merah "Stok Habis", tap disabled.
- Keranjang: tap qty → numpad popup untuk input manual (bukan hanya tombol +/-).
- **Selesai ketika:** transaksi 100 pcs bisa dimasukkan dalam ≤3 tap; produk habis tidak bisa masuk keranjang meski dipaksa tap.

### 4.3 Keamanan PIN
- PIN 4 digit, di-set di Pengaturan.
- Wajib untuk otorisasi "Hapus Transaksi" di riwayat.
- PIN salah → aksi hapus dibatalkan, tampilkan pesan error, tidak ada retry limit di v1 (bisa ditambah lockout di v1.1).
- **Selesai ketika:** hapus riwayat transaksi mustahil tanpa PIN benar; PIN tidak pernah ter-log di plaintext di manapun (termasuk debug log).

### 4.4 Pengaturan Toko & Struk
- Edit nama toko, jenis usaha, upload logo.
- Cetak struk via Bluetooth thermal printer (ESC/POS).
- Logo tercetak di header struk (auto convert ke monokrom/dither jika logo berwarna — jangan asumsikan user selalu upload logo B/W).
- **Selesai ketika:** struk tercetak lengkap (logo, nama toko, item, total, tanggal) dari printer Bluetooth yang sudah paired.

### 4.5 Laporan & Dasbor
- Filter waktu: Hari Ini / 7 Hari / 30 Hari / Kustom.
- Ringkasan: Omset, Jumlah Transaksi, Rata-rata/hari, Total HPP, Laba Kotor, % Margin.
- Leaderboard produk terlaris (top 5+, qty & nominal).
- Bar chart horizontal jam sibuk.
- Bar chart hari sibuk (Senin–Minggu).
- **Selesai ketika:** semua angka laporan konsisten dengan sum data TransactionItem pada rentang filter; laba kotor = 0 atau tidak dihitung untuk produk tanpa HPP (jangan asumsikan HPP = 0, tandai "HPP belum diisi" agar tidak menyesatkan).

### 4.6 Tutup Kasir / Shift
- Buka shift: input modal awal (opening cash).
- Selama shift, semua transaksi terhubung ke `shift_id`.
- Tutup shift: sistem hitung `closing_cash_system` (modal awal + total cash sales), kasir input `closing_cash_actual` (uang fisik dihitung manual), sistem tampilkan selisih.
- **Selesai ketika:** shift tidak bisa ditutup dua kali; transaksi baru tidak bisa dibuat tanpa shift aktif; riwayat shift (termasuk selisih) tersimpan dan bisa dilihat lagi.

### 4.7 Void Transaksi
- Beda dari "Hapus Transaksi" (§4.3): void **tidak menghapus** data, hanya mengubah status jadi `voided` + alasan wajib diisi (dropdown atau free text, min. karakter tertentu).
- Transaksi voided dikecualikan dari perhitungan Omset/Laba di Laporan, tapi tetap muncul di riwayat dengan label jelas.
- Void tetap butuh PIN (pakai mekanisme yang sama dengan §4.3).
- **Selesai ketika:** transaksi voided tidak mempengaruhi angka laporan tapi tetap tercatat & bisa diaudit; void tanpa alasan ditolak sistem.

### 4.8 Backup & Restore Manual
- Export seluruh database (produk, transaksi, settings) ke satu file (`.db` atau `.json`) yang bisa disimpan user ke local storage / Google Drive / dikirim via WhatsApp.
- Import: pilih file backup, sistem validasi format sebelum overwrite, tampilkan konfirmasi eksplisit (karena destruktif) sebelum eksekusi.
- **Selesai ketika:** backup lalu restore di device lain menghasilkan data identik; restore gagal (file korup/format salah) tidak merusak data yang sedang berjalan.

---

## 5. Saran Penambahan Fitur (v1.1+, belum masuk scope v1)

| Fitur | Kenapa penting untuk UMKM |
|---|---|
| **Diskon per item & per transaksi** | Sangat umum dibutuhkan, belum disebut di spec awal |
| **Barcode/QR scanner untuk input produk & kasir** | Percepat input untuk toko dengan SKU banyak |
| **Notifikasi stok menipis (threshold custom)** | Proaktif restock sebelum kehabisan |
| **Export laporan ke PDF/Excel** | Untuk laporan ke pemilik/pembukuan pajak sederhana |
| **Multi-kasir dengan PIN per akun** | Lacak siapa yang input transaksi mana, bukan cuma proteksi hapus |
| **Split/partial payment (cash + catatan manual QRIS)** | Realita banyak UMKM terima 2 metode sekaligus |

**Tutup Kasir**, **Void dengan alasan**, dan **Backup/Restore manual** sudah dimasukkan ke scope v1 (lihat §4.6–4.8). Fitur di tabel atas menyusul di v1.1.

---

## 6. Rencana Eksekusi Bertahap (untuk Coding Agent)

**Catatan alur kerja:** basis UI/UX awal dibuat dulu di Lovable (React + Supabase, web) sebagai **prototype tampilan saja** — bukan kode yang di-port langsung. Agent native (Flutter) membangun ulang dari nol mengikuti referensi visual/flow dari Lovable, bukan mewarisi arsitektur web/Supabase-nya. Ini penting ditegaskan ke agent supaya tidak mencoba menyalin struktur data atau logic dari kode Lovable — schema data yang dipakai tetap yang di §3, bukan schema Supabase.

**Fase 0 — Prototype UI/UX (Lovable, di luar scope agent)**
**Catatan alur kerja:** basis app dibuat dulu di Google AI Studio ("Build an Android app") — ini generate kode **Kotlin + Jetpack Compose native beneran**, bukan sekadar prototype visual seperti rencana Lovable sebelumnya. Hasilnya di-export via ZIP/GitHub ke Android Studio, lalu jadi starting point yang dilanjutkan agent — kode-nya dipakai, bukan dibuang.

**Fase 0 — Build Awal (Google AI Studio)**
- Tujuan: generate skeleton app — struktur navigasi antar screen (kasir, produk, laporan, settings), komponen UI dasar per §4, boleh pakai dummy/mock data dulu.
- Bukan tujuan di fase ini: logic bisnis penuh (perhitungan laporan real, validasi PIN produksi, cetak struk sungguhan) — ini feasible dibangun di AI Studio tapi tetap disarankan diverifikasi/dirapikan ulang oleh agent di fase berikut karena AI Studio dioptimalkan untuk kecepatan prototyping, bukan review mendalam per baris kode.
- Output ke agent: project hasil export ZIP/GitHub dari AI Studio — jadi starting state Fase 1, bukan direstart dari nol.

Karena scope ini besar untuk satu prompt, pecah jadi fase berikut. Setiap fase = starting state, target state, file/scope boundary, stop condition — ikuti format ini persis saat memberi instruksi ke agent.

**Fase 1 — Foundation & Review Schema**
- Starting state: project hasil export dari Google AI Studio (Fase 0) — **bukan** project kosong. Agent wajib baca dulu struktur yang sudah ada sebelum menambah kode.
- Target: review & rapikan schema Room sesuai model entities di §3 (AI Studio mungkin generate schema versi sendiri saat prototyping — selaraskan ke §3, jangan asal tambah tabel baru di atasnya).
- Scope: layer data (`data/local/` atau sesuai struktur hasil export — cek dulu package structure aktual).
- Stop condition: unit test schema lulus, DB bisa insert/query dummy product, struktur tabel cocok 1:1 dengan §3.

**Fase 2 — Manajemen Produk (4.1)**
- Target: CRUD produk + kategori + upload foto lokal — verifikasi/lengkapi implementasi dari Fase 0 sesuai acceptance criteria §4.1.
- Scope: package fitur produk (nama sesuai struktur hasil export AI Studio).
- Stop condition: produk baru muncul di list, stok logic (null/0/angka) sesuai spec.

**Fase 3 — Kasir (4.2)**
- Target: UI kasir, search, kategori horizontal, keranjang, numpad qty — lengkapi dari skeleton Fase 0.
- Scope: package fitur kasir.
- Stop condition: transaksi tersimpan ke DB dengan snapshot harga & HPP benar, stok berkurang.

**Fase 4 — Keamanan PIN (4.3)**
- Target: set PIN (hash+salt, `EncryptedSharedPreferences`), validasi hapus riwayat.
- Scope: package security/auth.
- Stop condition: hapus tanpa PIN benar mustahil, teruji dengan unit test.

**Fase 5 — Pengaturan Toko & Cetak Struk (4.4)**
- Target: settings screen + integrasi Bluetooth printer (ESC/POS) — ini kemungkinan besar belum ada di hasil AI Studio, jadi murni kerjaan baru agent.
- Scope: package settings + receipt.
- Stop condition: struk fisik tercetak lengkap dari printer nyata.

**Fase 6 — Laporan (4.5)**
- Target: dashboard filter waktu, summary, leaderboard, 2 bar chart (Vico atau lib Compose chart lain).
- Scope: package reports.
- Stop condition: angka laporan cocok dengan hasil query manual terhadap data uji.

**Fase 7 — Tutup Kasir / Shift (4.6)**
- Target: buka/tutup shift, hitung selisih kas, riwayat shift.
- Scope: package shift baru. Layer Transaction (Fase 3) perlu disentuh untuk relasi `shift_id` — tandai eksplisit ke agent bahwa ini satu-satunya kode lama yang boleh diubah di fase ini.
- Stop condition: transaksi baru mustahil dibuat tanpa shift aktif; selisih kas terhitung benar di data uji.

**Fase 8 — Void Transaksi (4.7)**
- Target: aksi void di riwayat transaksi, alasan wajib, exclude dari laporan.
- Scope: package riwayat transaksi, reuse mekanisme PIN dari Fase 4.
- Stop condition: transaksi voided tidak masuk perhitungan Laporan (Fase 6) tapi tetap terlihat di riwayat dengan label.

**Fase 9 — Backup & Restore (4.8)**
- Target: export/import seluruh DB Room ke file lokal.
- Scope: package backup baru.
- Stop condition: siklus export → hapus app data → import menghasilkan data identik di data uji.

---

## 7. Non-Functional Requirements

- App tetap responsif dengan katalog produk hingga ±500 item tanpa lag di search/filter.
- Semua data transaksi persist walau app force-close di tengah proses (gunakan transaction/atomic write di DB).
- PIN dan data sensitif tidak pernah masuk log/analytics.
- Ukuran APK dijaga wajar (hindari dependency berat yang tidak dipakai).
