# LAPORAN AUDIT & TEST — EDGE CASE TRANSAKSI KIOSK

**Mode:** AUDIT & TEST ONLY (tanpa perubahan kode, migrasi, skema, maupun data produksi)
**Tanggal:** 01 Oktober 2026
**Aplikasi:** KasirKu — `server.ts` (Express + sql.js WASM, port 3000), `src/pages/KioskPage.tsx`, `src/components/CheckoutModal.tsx`
**Data uji:** produk `TMP-KIOSK-EDGE`, user `tmpkiosedge` (dibuat sementara, dihapus di akhir)

---

## A. RINGKASAN AUDIT (14 edge case)

| # | Edge Case | Hasil | Bukti Singkat |
|---|-----------|-------|----------------|
| **A** | Checkout ganda (2 request identik / klik Konfirmasi 2×) | **FAIL — FINDING KRITIS** | API 2× POST bersamaan → `201+201`, **2 transaksi**, 2 movement, stok 8→6. UI klik sinkron 0 ms → **2 transaksi**, 2 movement, stok 10→8 (cart hanya qty 1) |
| B | Stok tidak cukup (stok 1, qty 2) | PASS | 400 `Stok … tidak mencukupi`; stok tetap 1; 0 transaksi/0 movement |
| C | Keranjang / checkout kosong | PASS | API `items:[]` → 400 `Keranjang kosong`; UI: tombol **Checkout disabled** + teks "Keranjang kosong" |
| D | Cancel checkout (tombol Batal) | PASS | Modal tertutup, cart utuh (qty 2), 0 transaksi, 0 movement, **0 notifikasi** |
| E | Checkout sukses + isolasi metrik | PASS | 1 transaksi `is_test=1`, item qty 1, stok 10→9, movement SALE, struk tampil, cart kosong setelah ditutup; Omset/Total/Barang Terjual/Gross Profit = **0**; laporan & daftar transaksi bersih |
| F | Produk berstatus `Tidak Aktif` | PASS | 400 `… tidak aktif dan tidak bisa dijual`; 0 transaksi |
| G | Stok berubah setelah masuk cart (5→2, checkout qty 3) | PASS | 400; stok tetap **2** (tidak jadi −1); 0 transaksi/0 movement |
| H | Pembayaran kurang (total 33.300, bayar 10.000) | PASS | 400 `Uang pembayaran kurang`; stok tidak berubah; **tidak ada notifikasi** terkirim |
| I | Payment invalid (0 / −1 / "abc" / null / missing) | PASS | Semua → 400, 0 transaksi. Overpay 999.999.999 → 201 + kembalian benar; pembayaran desimal (+0,5) → diterima |
| J | Race stok (stok 5, 2× checkout qty 3 bersamaan) | PASS | Respons `[201, 400]`; stok akhir **2**; tepat 1 transaksi & 1 movement; stok tidak negatif |
| K | Tombol qty+ disabled saat qty = stok | PASS | `plusEnabled=false`, `minusEnabled=true`; scan ulang → alert `Stok habis.`, qty tetap 1 |
| L | Produk sama discan dua kali | PASS | Qty menjadi **2 dalam 1 baris** (tidak duplikat baris); subtotal Rp 30.000 |
| M | Quantity invalid (0 / −1 / 1.5 / "abc" / null / missing) | PASS | Semua → 400 (`Item transaksi tidak valid`); stok tetap 10; 0 transaksi |
| N | Retry setelah checkout gagal | PASS | Gagal → alert `… tidak mencukupi`, 0 transaksi, **modal tetap terbuka**; retry → tepat 1 transaksi/1 item/1 movement, stok 5→4, tanpa alert, cart bersih |

**Rekap: 13 PASS, 1 FAIL (case A).**

---

## B. TEMUAN KODE (audit saja — TIDAK diperbaiki)

### FINDING-1 — KRITIS — Tidak ada proteksi checkout ganda / idempotency
- **Lokasi**
  - `src/pages/KioskPage.tsx:217-289` `handleCheckout` — tidak ada loading state, request lock, atau AbortController; `setShowCheckoutModal(false)` baru dijalankan **setelah** respons sukses (`:275-an`), sehingga tombol tetap bisa diklik selama request berjalan.
  - `src/components/CheckoutModal.tsx:121-127` tombol **Konfirmasi**; `:123` `disabled={paymentMethod==='cash' && (!cashPaid || isCashInsufficient)}` — hanya cek pembayaran, **tidak ada flag `isSubmitting`**.
  - `server.ts:1956` `POST /api/transactions` — **tanpa** mekanisme idempotency/deduplikasi. `reference_no` dibuat di `server.ts:2026` (`TRX-${Date.now()}-${randomUUID 8 char}`) sehingga **selalu unik** → tiap request sah menjadi transaksi baru.
- **Dampak:** satu aksi pengguna bisa menghasilkan 2 struk/2 tagihan, stok terpotong 2×, 2 notifikasi Telegram, dan (untuk produk non-TMP) 2 baris di laporan keuangan.
- **Skenario nyata:** klik Konfirmasi dua kali cepat (terkonfirmasi, 0 ms jeda), koneksi lambat lalu user klik ulang, retry manual.
- **Catatan:** dengan jeda 30 ms hasilnya hanya 1 transaksi (respons server sudah menutup modal lebih dulu) → kegantungan pada timing, **bukan** perlindungan.
- **Rekomendasi:** (a) flag `isSubmitting` di UI sehingga tombol dinonaktifkan selama request; (b) idempotency key di server (header `Idempotency-Key` + index/unik sementara) untuk menolak permintaan ulang dengan key yang sama.

### FINDING-2 — SEDANG — Data produk di klien tidak pernah di-refresh
- **Lokasi:** `src/pages/KioskPage.tsx:248` (`GET /api/products?status=Aktif` hanya saat mount) — tidak ada refetch setelah checkout sukses/gagal maupun saat stok berubah dari luar.
- **Dampak:** guard `existing.quantity >= product.stock` (`:171`) dan `disabled={item.quantity >= item.stock}` (`:472`) memakai **stok basi**, sehingga UI mengizinkan qty melebihi stok sebenarnya (baru ditolak server saat checkout → pengalaman kasir membingungkan).
- **Rekomendasi:** refetch produk setelah tiap transaksi dan saat modal checkout dibuka.

### FINDING-3 — RENDAH — Keranjang in-memory tanpa penyimpanan
- **Lokasi:** `src/pages/KioskPage.tsx:48` (`useState` polos).
- **Dampak:** refresh halaman / putus listrik menghapus keranjang tanpa peringatan (dalam audit ini justru dimanfaatkan untuk mereset cart).
- **Rekomendasi:** persist ke `sessionStorage` bila diperlukan ketahanan.

### FINDING-4 — INFO — Seluruh pesan galat memakai `alert()` blocking
- **Lokasi:** `KioskPage.tsx:161,165,172,196,234,241,287`; `CheckoutModal.tsx:38,43`.
- **Dampak:** alur kasir terhenti sampai dialog ditutup; tidak ada peringatan non-blocking.

### FINDING-5 — INFO — Semua galat server dikembalikan sebagai 400 bertype teks
- **Lokasi:** `server.ts:1977-2023` (`throw new Error(...)`) → `server.ts:2086-2089`.
- **Dampak:** tidak ada kode error terstruktur; klien membandingkan string pesan.

### FINDING-6 — INFO — Notifikasi Telegram dikirim setelah COMMIT
- **Lokasi:** `server.ts:2047-2075` (dibungkus `try/catch`).
- **Dampak positif:** kegagalan kirim tidak menggagalkan transaksi. **Kekurangan:** tidak ada retry/status antrean per transaksi (status tercatat per baris notifikasi saja).

### FINDING-7 — INFO — Pembayaran desimal diterima
- **Lokasi:** `server.ts:2022-2023` (`Number(...)` + `paymentAmount < grandTotal`).
- **Dampak:** nominal kas dapat berupa pecahan; kembalian non-integer.

### ASPEK YANG TERBUKTI AMAN (tanpa temuan)
| Aspek | Lokasi bukti |
|-------|--------------|
| Atomicity stok & rollback | `src/lib/db/index.ts:980-1021` — `BEGIN IMMEDIATE`, `UPDATE … AND stock >= ?`, cek `getRowsModified() !== 1` → `ROLLBACK`; case J lulus, stok tak pernah negatif |
| Validasi item lengkap (qty integer ≥1, harga jual >0, status aktif) | `server.ts:1977-2001` |
| Validasi pembayaran sebelum insert | `server.ts:2022-2023` |
| Isolasi transaksi testing `is_test` pada seluruh metrik | `server.ts:287,297,316,327,941,1263,1447,1463,1507,2289` (diverifikasi ulang pada case E) |
| Cart dikosongkan setelah struk ditutup | `KioskPage.tsx:523` (`onClose`) → `closeReceiptAndReset` `:291-295` |
| Tombol checkout disabled saat cart kosong | `KioskPage.tsx:445,503` |

---

## C. REKAPITULASI PENGUJIAN

| Rangkaian | Asersi | PASS | FAIL |
|-----------|--------|------|------|
| Test API (`tmp-kiosk-edge-api`) | 44 | 42 | 2 |
| Test UI via Chrome CDP (`tmp-kiosk-edge-ui`) | 32 | 31 | 1¹ |
| Uji lanjutan klik ganda sinkron (`tmp-kiosk-edge-aui`) | 5 | 2 | 3 |
| Test K + N (`tmp-kiosk-edge-kn`) | 17 | 17 | 0 |
| **TOTAL** | **98** | **93** | **5** |

¹ FAIL tersebut berasal dari asersi saya yang keliru (mengharap stok −1 padahal qty cart = 2 → stok −2 memang benar); perilaku aplikasi benar, sehingga dikoreksi menjadi PASS.

- **PASS: 93 — FAIL: 5 — SKIPPED: 0** (seluruh case A–N tercakup).
- Kelima FAIL berasal dari **case A (checkout ganda)**: 2 pada uji API dan 3 pada uji UI.

---

## D. INTEGRITAS DATA (BEFORE vs AFTER)

| Tabel / metrik | BEFORE (baseline) | AFTER (final) | Status |
|----------------|-------------------|---------------|--------|
| products | 122 | 122 | ✅ identik |
| products (status Aktif) | 119 | 119 | ✅ identik |
| users | 2 | 2 | ✅ identik |
| transactions | 0 | 0 | ✅ identik |
| transaction_items | 0 | 0 | ✅ identik |
| stock_movements | 0 | 0 | ✅ identik |
| discount_rules | 0 | 0 | ✅ identik |
| products `code LIKE 'TMP-%'` | 0 | 0 | ✅ identik |
| transaksi ber-basis produk `TMP-%` | 0 | 0 | ✅ identik |
| `PRAGMA integrity_check` | ok | ok | ✅ identik |
| notifications_queue | 13 | **14** | ⚠️ +1 (lihat catatan) |
| audit_log | 106 | **108** | ⚠️ +2 (lihat catatan) |

**Catatan delta (bukan data test):**
- `audit_log #175` — login user `admin`, 01/10/2026 10:11:51 WIB.
- `audit_log #178` — update produk `168 / EV 2001` oleh `admin`, 01/10/2026 10:13:27 WIB.
- `notifications_queue #100` — `PERUBAHAN STOK EV 2001 … Sebelum 3 → Sesudah 5 BOX` (padanannya).
- Ketiganya adalah **aktivitas admin eksternal yang terjadi di jendela waktu pengujian**, bukan bagian dari data uji; sengaja tidak dihapus.
- Sisa 12 baris audit berlabel `tmp-uji-admin-01` / `TMP-DISCOUNT` adalah **baseline task sebelumnya** (sudah termasuk dalam angka BEFORE 106).

**Data uji yang dibersihkan (berbasis ID/marker, urutan dependency, `foreign_keys OFF`):**
11 transaksi uji → 11 `transaction_items` → 11 `stock_movements` → 1 produk `TMP-KIOSK-EDGE` → 1 user `tmpkiosedge` → 37 notifikasi (marker kode/deskripsi produk) → 30 baris audit (`user_id` uji / `entity=product` id uji).
Tidak ada `DELETE` global. Setelah restart server: jumlah stabil, dashboard kembali `omzet=0, trx=0, barang=0, profit=0`.

---

## E. KLASIFIKASI

# 🔴 HIGH RISK

**Alasan:** satu temuan kritis terkonfirmasi secara nyata — **checkout ganda menghasilkan dua transaksi sungguhan** (uji API maupun uji UI), yang berujung pada penagihan ganda, stok terpotong dua kali, notifikasi ganda, dan potensi selisih keuangan. Case lain (13 dari 14) lulus penuh, dan seluruh mekanisme atomicity stok/validasi server terbukti sehat.

**Prioritas perbaikan (bila diperintahkan nanti):** FINDING-1 (idempotency + lock UI) → FINDING-2 (refresh data produk).

---

### Artefak pendukung
- Screenshot (folder `%TEMP%\opencode\`): `kiosk-edge-01-qty2.png`, `kiosk-edge-02-cancel.png`, `kiosk-edge-03-doubleclick.png`, `kiosk-edge-04-struk.png`, `kiosk-edge-05-doubleclick-sync.png`, `kiosk-edge-06-stok-penuh.png`, `kiosk-edge-07-gagal.png`, `kiosk-edge-08-retry-sukses.png`.
- Snapshot `BEFORE`/`AFTER` jumlah tabel dan hasil tiap rangkaian uji telah disimpan selama berjalannya audit dan **dihapus bersama seluruh berkas `tmp-kiosk-edge-*`** sesuai aturan pembersihan.

**Status akhir:** server berjalan (port 3000), seluruh artefak uji dihapus, tanpa perubahan kode/migrasi/skema apa pun.
