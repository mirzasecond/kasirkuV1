# LAPORAN FIX FINDING-1 — DOUBLE CHECKOUT / DUPLICATE TRANSACTION

Tanggal: 2026-10-01
Scope: **hanya FINDING-1** dari audit edge case kiosk (`LAPORAN-AUDIT-EDGE-CASE-KIOSK.md`). Finding-2 s/d Finding-7 tidak disentuh.

---

## A. Root Cause Sebelum Fix

**Frontend (`src/components/CheckoutModal.tsx` + `src/pages/KioskPage.tsx`)**

| Masalah | Bukti |
|---|---|
| Tombol `Konfirmasi` tidak pernah dikunci saat submit | `disabled` hanya mengecek kekurangan bayar metode cash — klik ganda tetap aktif |
| Tidak ada state `isSubmitting` / lock | modal langsung memanggil `onCheckout` pada setiap klik |
| `handleCheckout` async tanpa guard | klik ke-2 menghasilkan `fetch` paralel, bukan diabaikan |

**Backend (`server.ts` — `POST /api/transactions`)**

| Masalah | Bukari |
|---|---|
| Tidak ada lock maupun idempotency | 2 request paralel = 2 baris `transactions` |
| `reference_no` selalu dibuat unik | duplikat tidak pernah terdeteksi oleh constraint mana pun |
| Efek berganda | `transaction_items`, `stock_movements`, notifikasi checkout, pengurangan stok ikut terduplikasi |

**Kesimpulan:** tidak ada satu pun lapisan (UI maupun API) yang menjamin *exactly-once* untuk satu aksi checkout → risiko transaksi ganda (HIGH RISK).

---

## B. File yang Diubah (4 file, tanpa refactor besar)

1. `src/pages/KioskPage.tsx`
2. `src/components/CheckoutModal.tsx`
3. `server.ts`
4. `src/lib/db/index.ts`

Tidak ada file lain yang diubah. `package.json` & `package-lock.json` **tidak berubah** (diverifikasi via hash SHA-256 sebelum/sesudah).

---

## C. Perubahan Frontend

**`src/components/CheckoutModal.tsx`**
- Prop baru `submitting?: boolean` (baris 10).
- Guard: `if (submitting) return;` — klik saat memproses diabaikan.
- `disabled={submitting || (metode cash && bayar kurang)}`.
- Label tombol: `{submitting ? 'Memproses...' : 'Konfirmasi'}`.

**`src/pages/KioskPage.tsx`**
- `isCheckoutSubmitting` (state, baris 71) → mengunci tombol via re-render.
- `checkoutLockRef` (baris 72) → **guard sinkron**; state React bisa belum ter-update saat klik ke-2 datang pada milidetik yang sama.
- `checkoutIdemKeyRef` (baris 76) → satu key untuk satu aksi checkout; di-reset saat keranjang berubah (`useEffect`, baris 79) dan di-null saat sukses (baris 321), sehingga **retry transaksi yang sama memakai key yang sama** sedangkan checkout berikutnya memakai key baru.
- `handleCheckout`: baris 235 `if (checkoutLockRef.current) return;` → set lock → `try/finally` melepas lock + state (baris 329).
- Mengirim header `Idempotency-Key` pada `fetch` (baris 299–300).
- Mengoper `submitting={isCheckoutSubmitting}` ke `<CheckoutModal>` (baris 562).

---

## D. Perubahan Backend

**`src/lib/db/index.ts`**
- Interface `CheckoutIdempotencyRow` (baris 25).
- Tabel **baru** `checkout_idempotency` via `CREATE TABLE IF NOT EXISTS` (baris 300) — migrasi additive, tanpa menyentuh schema produk yang ada:
  ```
  key TEXT PRIMARY KEY, status ('pending'|'done'), transaction_id,
  response, created_at, updated_at
  ```
- Konstanta: `IDEMPOTENCY_PENDING_STALE_MS` (2 menit) dan `IDEMPOTENCY_DONE_TTL_MS` (24 jam).
- 3 metode atomik di atas database yang sama (ikut `save()` → file DB ikut tertulis):
  - `claimIdempotency(key)` (baris 647) — `INSERT` atomik; `key` PRIMARY KEY.
  - `finishIdempotency(key, transactionId, response)` (baris 691).
  - `releaseIdempotency(key)` (baris 707).

**`server.ts` — `POST /api/transactions` (baris 1960+)**
- Membaca header `Idempotency-Key` (trim, maks 128 karakter) — baris 1967.
- Klaim **setelah auth & sebelum validasi payload** (baris 1991).
- Duplikat → replay: `Idempotency-Replayed: true` + `res.status(201).json(payloadPersis)` (baris 1996).
- Sedang diproses → `409` `{duplicate:true}` (baris 2003).
- Sukses → `finishIdempotency` sebelum `res.json` (baris 2123).
- Gagal → `releaseIdempotency` di blok `catch` (baris 2131) agar retry tidak terblokir.

---

## E. Mekanisme Idempotency (desain)

| Aspek | Keputusan | Alasan |
|---|---|---|
| Penanda aksi | Header `Idempotency-Key` | Standar de-facto, tidak mengubah body/DB schema transaksi |
| Tanpa header | **Perilaku lama persis** | Kompatibel dengan klien lama / non-kiosk |
| Klaim | `INSERT` ber-PRIMARY KEY | UNIQUE menang untuk request concurrent secara atomik — bukan "cek transaksi terakhir" (selalu kalah race) |
| Duplikat selesai | Replay **201 + payload identik** + `Idempotency-Replayed: true` | Bentuk respons sama sehingga retry logic tidak menganggapnya transaksi baru |
| Sedang berjalan | `409 {duplicate:true}` | Mencegah duplikat saat request pertama masih memproses |
| Gagal (validasi stok dsb.) | Release klaim | Retry dengan key yang sama diperbolehkan (diuji TEST 5) |
| Kebersihan | Prune `done` > 24 jam; takeover `pending` > 2 menit | Tabel tidak tumbuh tanpa batas, klaim tidak menggantung |
| Single-process | Klaim disimpan pada DB yang sama (sql.js, satu proses) | Konsisten dengan arsitektur aplikasi |

---

## F. Hasil Test (TEST 1–5)

### TEST 1 — Klik ganda "Konfirmasi" (UI, 0 ms) — **27 PASS / 0 FAIL**

| # | Asersi | Hasil |
|---|---|---|
| 1 | Tepat **1 transaksi** dari klik ganda | PASS |
| 2 | 1 baris `transaction_items` | PASS |
| 3 | quantity item = 2 (sesuai keranjang) | PASS |
| 4 | 1 `stock_movement` | PASS |
| 5 | Stok berkurang sekali (10 → 8) | PASS |
| 6 | Stok tidak negatif | PASS |
| 7 | 1 struk terbuka | PASS |
| 8 | Klaim idempotency `pending` = 0 | PASS |
| 9 | Transaksi uji ber-flag `is_test = 1` | PASS |
| 10 | Notifikasi checkout hanya 1 | PASS |
| 11 | Tidak ada item yatim | PASS |
| 12 | Cart kosong setelah struk ditutup | PASS |
| 13 | Tombol Checkout disabled saat cart kosong | PASS |
| 14 | Omset/Transaksi/Barang Terjual/Gross Profit = 0 | PASS |
| 15 | Laporan tidak tercemar | PASS |
| 16 | Daftar transaksi tidak menampilkan transaksi testing | PASS |
| 17 | Top-products kosong | PASS |

> Catatan bukti keras: pada klik ke-2, tombol masih berbunyi `Konfirmasi` dan `disabled:false` (React belum sempat re-render) → **`checkoutLockRef` yang memblokir**. Jika guard frontend dilewati, backend tetap menahan (TEST 2).

### TEST 2 — 2 request API concurrent, key sama — **PASS**
`201/201`, **id transaksi sama**, 1 transaksi, 1 item, 1 movement, stok 10→9 (sekali), 1 notifikasi.

### TEST 3 — key berbeda — **PASS**
2 transaksi sah (memang aksi berbeda).

### TEST 4 — retry checkout sukses — **PASS**
Replay `idempotency-replayed: true`, id sama, stok/movement/notifikasi tidak bertambah.

### TEST 5 — checkout gagal (stok kurang) — **PASS**
`400`, 0 transaksi/movement/notifikasi, `idem_pending = 0`; retry key sama → `201`.

**Total API suite: 60 PASS / 0 FAIL.**

---

## G. Regression — **10/10 PASS + UI regression**

| ID | Skenario | Hasil |
|---|---|---|
| R1 | Keranjang kosong ditolak | PASS |
| R2 | Quantity invalid | PASS |
| R3 | Stok tidak cukup | PASS |
| R4 | Pembayaran kurang | PASS |
| R5 | `payment_method` invalid (5 nilai) | PASS |
| R6 | Produk non-aktif | PASS |
| R7 | Stok berubah setelah masuk keranjang | PASS |
| R8 | Race stok (2 request) → 1 sukses, 1 ditolak, stok 2 | PASS |
| R9 | Checkout **tanpa** header idempotency → tetap `201` (kompatibilitas) | PASS |
| R10 | Isolasi `is_test` + dashboard + laporan | PASS |
| UI-1 | Produk diskon scan 2× → 1 baris qty 2, subtotal Rp 30.000 | PASS |
| UI-2 | Batalkan checkout → cart utuh, 0 transaksi/movement/notifikasi | PASS |

Diskon, pajak (11%), subtotal, grand total, pembayaran, stok, movement, `is_test`, dashboard, laporan, Telegram, audit, auth, role, impor, dan schema produk **tidak diubah**.

---

## H. Database: BEFORE vs AFTER

| Metrik | Baseline produksi (BEFORE) | Sesudah test | Sesudah cleanup (AFTER) |
|---|---:|---:|---:|
| products | 122 | 123 | **122** |
| users | 2 | 3 | **2** |
| transactions | 0 | 9 | **0** |
| transaction_items | 0 | 9 | **0** |
| stock_movements | 0 | 9 | **0** |
| discount_rules | 0 | 0 | **0** |
| notifications_queue | 14 | 41 | **14** |
| audit_log | 108 | 131 | **108** |
| checkout_idempotency | (tabel baru) | 8 | **0** |
| products_aktif | 119 | 120 | **119** |
| `tmp-*` product | 0 | 1 | **0** |
| `is_test = 1` | 0 | 9 | **0** |
| integrity_check | ok | ok | **ok** |
| foreign_key_check | none | none | **none** |
| orphan tx / movement | 0 / 0 | 0 / 0 | **0 / 0** |
| stok negatif | 0 | 0 | **0** |

*(Snapshot `BEFORE` yang berisi `users: 3` sudah termasuk user uji yang dibuat untuk task ini; baseline produksi murni = 2, dan AFTER kembali ke 2.)*

Delta **+1 notifikasi / +2 audit_log** yang tercatat pada awal task berasal dari aktivitas **admin eksternal** (login audit, update produk) — **dipertahankan, tidak dihapus**.

---

## I. tsc / build / integrity

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | **EXIT 0 — OK** |
| `npm run build` (tsc + vite) | **OK** → `dist/assets/index-DoG5xocc.js` |
| Bundle sama dengan yang diuji Test 1 | **Ya — hash identik** (`index-DoG5xocc.js`) |
| `PRAGMA integrity_check` | **ok** |
| `PRAGMA foreign_key_check` | **none** |
| `node_modules` vs `package-lock.json` | **352/352 versi cocok, 0 beda** |
| `package.json` / `package-lock.json` | hash tidak berubah |

### Insiden saat cleanup & pemulihan (transparansi)
Pembersihan pola artefak `gen-*` dengan pencarian rekursif **secara keliru menghapus** `node_modules/@jridgewell/gen-mapping/dist/gen-mapping.*` (dependency PostCSS, bukan artefak test) → build gagal. Dipulihkan dengan mengembalikan persis versi lock (`npm ci`); manifest tidak berubah; hasil akhir: semua versi cocok lock dan bundle kembali identik dengan bundle yang lulus test.

---

## J. Hasil Cleanup

Data uji dihapus (server STOPPED, `foreign_keys OFF`, penulisan balik `db.export()`, tanpa DELETE global):

| Sasaran | Jumlah dihapus |
|---|---:|
| `transactions` (via `product_code='TMP-TRX-E2E'`) | 9 |
| `transaction_items` | 9 |
| `stock_movements` (produk uji) | 9 |
| `checkout_idempotency` | 8 |
| `products` (`TMP-TRX-E2E`) | 1 |
| `users` (`tmpfix1`) | 1 |
| `notifications_queue` (marker kode/deskripsi/user) | 27 |
| `audit_log` (user uji OR entity produk uji) | 23 |

Setelah cleanup:
- Artefak `tmp-*` / `write-test-*` / `gen-*` tersisa: **0**
- Chrome test (CDP 9333): **dimatikan**
- Server: **UP**, dashboard `omzet 0 / transaksi 0 / barang 0 / profit 0`
- Backup sebelum perubahan dipertahankan: `data/backups/kasirku-sebelum-fix-double-checkout.db` (159.744 bytes)

---

## 14 KRITERIA SELESAI

| # | Kriteria | Status |
|---|---|---|
| 1 | Hanya FINDING-1 yang diperbaiki | ✅ |
| 2 | Frontend: kunci submit mencegah klik ganda (state + ref sinkron) | ✅ |
| 3 | Backend: idempotency checkout (klaim atomik) | ✅ |
| 4 | Diskon / pajak / subtotal / grand total tidak berubah | ✅ |
| 5 | Pembayaran / stok / stock movement tidak diubah fungsinya | ✅ |
| 6 | `is_test`, dashboard, laporan, Telegram, audit, auth, role tidak diubah | ✅ |
| 7 | Impor & schema produk tidak diubah (tabel baru additive `IF NOT EXISTS`) | ✅ |
| 8 | Tanpa refactor besar / tanpa DELETE global | ✅ |
| 9 | Backup dibuat sebelum perubahan (tanpa menimpa backup lama) | ✅ |
| 10 | Test memakai produk TMP (`TMP-TRX-E2E`) | ✅ |
| 11 | TEST 1–5 lulus semua | ✅ |
| 12 | Regression lulus semua | ✅ |
| 13 | `tsc --noEmit` + `npm run build` + integrity check lulus | ✅ |
| 14 | Artefak `tmp-*` dibersihkan & laporan A–J disampaikan | ✅ |

**Status: SELESAI — berhenti di sini (sesuai instruksi: perbaiki Finding-1 saja, lalu STOP).**
