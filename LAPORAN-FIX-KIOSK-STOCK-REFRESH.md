# LAPORAN FIX FINDING-2 — DATA STOK KIOSK STALE

Tanggal: 2026-10-01
Scope: **hanya FINDING-2** dari `LAPORAN-AUDIT-EDGE-CASE-KIOSK.md`. Finding-1 (sudah diperbaiki sebelumnya, `LAPORAN-FIX-DOUBLE-CHECKOUT.md`) dan Finding-3 s/d Finding-7 **tidak disentuh**.

---

## A. Root Cause Finding-2

`src/pages/KioskPage.tsx` mengambil produk **tepat satu kali saat mount**:

```tsx
useEffect(() => {
  fetchProducts();          // GET /api/products?status=Aktif
}, []);                     // ← tidak pernah dipanggil lagi
```

Setelah itu tidak ada jalur apa pun yang memperbarui `state products`, sehingga:

| Titik stale | Dampak |
|---|---|
| `Stok: {product.stock}` di grid kartu | angka lama, padahal stok sudah berubah di Admin/kasir lain |
| Guard `addToCart` (`product.stock <= 0`, `existing.quantity >= product.stock`) | membandingkan dengan snapshot lama |
| Guard `updateQuantity` (`newQty > item.stock`) | memakai `item.stock` yang tersalin ke keranjang saat ditambahkan |
| Tombol `+` di keranjang (`disabled={item.quantity >= item.stock}`) | disabled/enabled berdasarkan stok basi |

Backend **tetap** memvalidasi stok terbaru (`server.ts:2022` — `if (product.stock < quantity) throw new Error(...)`), jadi tidak pernah ada transaksi dengan stok negatif. Dampaknya murni **UX/sinkronisasi tampilan**: kasir melihat stok lama, baru mengetahui ketolakan setelah menekan Konfirmasi.

---

## B. File yang Diubah

| # | File | Perubahan |
|---|---|---|
| 1 | `src/pages/KioskPage.tsx` | **satu-satunya file** — menambah `syncCartStock()`, `refreshProducts()`, `openCheckout()` |

**Tidak ada perubahan backend, tidak ada perubahan schema database, tidak ada perubahan API.**
Endpoint `GET /api/products` dipakai apa adanya. Validasi stok backend, `createTransaction()`, idempotency, double-checkout lock, DiscountService, pajak, pembayaran, dashboard, laporan, `is_test`, Telegram, audit, auth, role, dan impor Excel **tidak diubah sama sekali**.

---

## C. Mekanisme Refresh yang Dipilih

**Refresh berbasis EVENT (on-demand), bukan polling.** Satu fungsi `refreshProducts()` dipanggil dari empat titik peristiwa:

| # | Peristiwa | Pemanggilan | Sinkron ke keranjang? |
|---|---|---|---|
| 1 | Kiosk dibuka (mount) | `useEffect(..., [])` → `refreshProducts()` | ya (keranjang masih kosong) |
| 2 | Checkout dibuka (tombol **Checkout Sekarang** / shortcut **F9**) | `openCheckout()` → `refreshProducts()` | **ya** — stok terkini + peringatan bila qty melebihi stok |
| 3 | Checkout **sukses** | `refreshProducts({ syncCart: false })` | tidak — hanya grid; struk & keranjang tidak disentuh |
| 4 | Checkout **gagal** | `refreshProducts()` | ya — penyebab gagal paling umum adalah stok berubah |

Detail implementasi (`src/pages/KioskPage.tsx`):

- **Baris 47 — `syncCartStock(cart, fresh)`**: memperbarui **hanya `stock`** pada tiap baris keranjang. Mengembalikan **referensi array yang sama** bila tidak ada perubahan, sehingga efek `fetchTotals` (diskon + pajak) tidak ikut terpicu tanpa alasan.
- **Baris 125 — `refreshProducts(opts?)`**: `fetch(..., { cache: 'no-store' })` → `setProducts(fresh)`; peringatan dihitung **di luar** updater React, updater memakai `prev` terbaru.
- **Baris 171 — `openCheckout()`**: membuka modal **tanpa memblokir** lalu memicu refresh di latar belakang.
- Kegagalan refresh ditangani di blok `catch` (baris 160): `console.error` saja — **data lama dan keranjang dipertahankan**.

**Perilaku cart (BAGIAN 4) — quantity tidak pernah diubah diam-diam:**

```text
Stok "Produk Test Kiosk Stock Refresh" berubah dari 5 menjadi 2,
sedangkan jumlah di keranjang adalah 3.
Kurangi jumlah sebelum checkout — server akan menolak bila stok tidak mencukupi.
```

Peringatan hanya muncul **sekali per transisi stok** (bukan setiap refresh), jadi tidak berulang saat retry. Produk yang hilang/di-nonaktif **tidak dihapus** dari keranjang (jangan menghapus isi cart sembarangan) — server yang menolak saat checkout.

---

## D. Alasan Memilih Mekanisme tersebut

1. **Instruksi meminta event-based/on-demand lebih dulu**, polling hanya cadangan bila tidak ada titik peristiwa yang tepat. Ternyata tersedia empat titik alami: mount, buka checkout, checkout sukses, checkout gagal.
2. **Titik "buka checkout" adalah yang paling menentukan** — persis momen kasir harus melihat angka stok yang benar sebelum menerima uang, sehingga ketolakan `server.ts:2022` jarang terjadi.
3. **Refresh sukses dipisah (`syncCart: false`)** agar tidak ada alert/dialog yang mengganggu struk, dan keranjang dibiarkan (dikosongkan oleh alur `closeReceiptAndReset` yang sudah ada).
4. **Tanpa interval, tanpa `setInterval`, tanpa `setTimeout` berulang, tanpa `useEffect` yang bergantung pada `products`** → mustahil terjadi infinite fetch loop.
5. **`cache: 'no-store'`** memastikan jawaban bukan hasil simpanan peramban.
6. **Tanpa perubahan backend/schema** — solusi paling minimal sesuai aturan tugas, dan validasi stok server tetap satu-satunya pengaman terakhir.

---

## E. Test Result

Semua test memakai produk uji **`TMP-KIOSK2`** (id 316, stok awal 10, harga Rp 15.000) dan user uji `tmpkiosk2` — **tidak menyentuh produk/produk produksi**.

| Test | Result |
|---|---|
| Initial load | **PASS** |
| External stock change | **PASS** |
| Cart stale stock | **PASS** |
| Checkout success refresh | **PASS** |
| Checkout failure | **PASS** |
| Cancel checkout | **PASS** |
| Double checkout regression | **PASS** |
| Idempotency regression | **PASS** |
| Search/scan | **PASS** |
| Quantity | **PASS** |

**Total: 45 asersi — 45 PASS, 0 FAIL.**

Bukti kunci per skenario:

- **Initial load** — kartu tampil `Stok: 10`; **tepat 1** `GET /api/products`; keranjang kosong.
- **External stock change (stok 10 → 5 lewat `PUT /api/products/:id`)** — begitu **Checkout Sekarang** ditekan, grid menampilkan **5** (bukan 10), keranjang tetap `qty 3`, 0 transaksi dibuat, **1 request** refresh.
- **Cart stale stock (stok 5 → 2, keranjang qty 3)** — peringatan persis `"berubah dari 5 menjadi 2 … keranjang adalah 3"`; grid menampilkan **2**; **quantity tidak berubah diam-diam (tetap 3)**.
- **Checkout failure** — server menjawab `Stok Produk Test Kiosk Stock Refresh tidak mencukupi`; **0 transaksi, 0 stock_movement, stok tetap 2 (tidak negatif), keranjang utuh, modal tetap terbuka (bisa retry), `idempotency pending = 0`**.
- **Cancel checkout** — modal tertutup, keranjang tetap `qty 3`, 0 transaksi.
- **Double checkout regression** — klik ganda 0 ms → **tepat 1 transaksi**, 1 movement, stok 10 → 7 (sekali), `is_test = 1`, tanpa alert tak terduga.
- **Checkout success refresh (T4)** — setelah struk ditutup, grid menampilkan **stok 7** (bukan 10), keranjang kosong.
- **Idempotency regression** — 2 request `POST /api/transactions` concurrent dengan `Idempotency-Key` sama → keduanya `201`, **id transaksi identik** (`0btwvkm9oc6h14c8wf6il`), tepat 1 transaksi baru, stok hanya dipotong sekali (7 → 6).
- **Search/scan** — scan barcode → 1 baris qty 1; scan ke-2 → tetap 1 baris qty 2; pencarian nama → 1 kartu.
- **Quantity** — `+` → 2 → 3, `−` → 2 → 1 → keranjang kosong, isi ulang ke 3.

---

## F. Performance

**Jumlah `GET /api/products` (diukur lewat CDP `Network.requestWillBeSent`):**

| Aksi | Request |
|---|---:|
| Membuka Kiosk (mount) | **1** |
| Membuka checkout (per klik Checkout/F9) | **1** |
| Checkout sukses | **1** |
| Checkout gagal | **1** |
| **Total satu rangkaian** buka Kiosk → buka checkout → sukses | **3** |
| **Idle 6 detik tanpa interaksi** | **0** |

- **Polling: TIDAK ADA.** Tidak ada `setInterval`, `setTimeout` berulang, maupun fetch loop.
- **Infinite effect/useEffect loop: TIDAK ADA.** Satu-satunya `useEffect` fetch produk memakai deps `[]` (sekali di mount); tidak ada efek yang bergantung pada `products`, sehingga refresh tidak pernah memicu refresh.
- Refresh beruntun (mis. klik buka-tutup-buka checkout) tetap satu request per peristiwa — dibatasi oleh sifat event-driven, bukan timer.

---

## G. Database BEFORE vs AFTER

| Metrik | BEFORE (baseline) | SETELAH TEST | AFTER (cleanup) |
|---|---:|---:|---:|
| products | 122 | 123 | **122** |
| users | 2 | 3 | **2** |
| transactions | 0 | 2 | **0** |
| transaction_items | 0 | 2 | **0** |
| stock_movements | 0 | 2 | **0** |
| discount_rules | 0 | 0 | **0** |
| notifications_queue | 14 | 19 | **14** |
| audit_log | 108 | 116 | **108** |
| checkout_idempotency | 0 | 2 | **0** |
| products_aktif | 119 | 120 | **119** |
| produk `TMP-*` | 0 | 1 | **0** |
| user `tmp*` | 0 | 1 | **0** |
| `is_test = 1` | 0 | 2 | **0** |
| orphan tx / movement | 0 / 0 | 0 / 0 | **0 / 0** |
| `stock < 0` | 0 | 0 | **0** |
| `PRAGMA integrity_check` | ok | ok | **ok** |

**Semua 16 metrik AFTER == BEFORE** — tidak ada data produksi yang terhapus.

Dashboard setelah cleanup: **Omset Rp0 · Transaksi 0 · Barang Terjual 0 · Gross Profit Rp0**.

> Catatan: query diagnostik menemukan 9 baris `audit_log` dengan `user_id LIKE 'tmp-%'` — semuanya milik `tmp-uji-admin-01` dari task sebelumnya (2026-09-30/10-01) yang **sudah ada di baseline** dan sengaja dipertahankan; `entity_id = '316'` (produk uji task ini) **0 baris**.

---

## H. tsc / build / integrity

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | **OK** |
| `npm run build` (tsc + vite) | **OK** → `dist/assets/index-C809CNQb.js` (bundle yang sama dengan yang diuji) |
| `PRAGMA integrity_check` | **ok** |
| `PRAGMA foreign_key_check` | **none** |
| Server berjalan normal | **OK**, port 3000, dashboard 0/0/0/0 |
| `package.json` / `package-lock.json` | tidak diubah |

---

## I. Cleanup

| Sasaran | Dihapus |
|---|---:|
| `transactions` (via `product_code='TMP-KIOSK2'`) | 2 |
| `transaction_items` | 2 |
| `stock_movements` (produk 316) | 2 |
| `checkout_idempotency` (semua baris berasal dari test ini) | 2 |
| `products` (`TMP-KIOSK2`) | 1 |
| `users` (`tmpkiosk2`) | 1 |
| `notifications_queue` (marker kode/deskripsi/user) | 5 |
| `audit_log` (user uji OR `entity='product' AND entity_id='316'`) | 8 |

- Dilakukan saat **server STOPPED**, `foreign_keys OFF`, penulisan balik `db.export()`, **tanpa `DELETE` global**.
- Artefak `tmp-*` / `write-test-*` tersisa: **0** (10 file `tmp-kiosk2-*` dihapus).
- Chrome test (CDP 9333) dimatikan.
- Backup sebelum perubahan dipertahankan: `data/backups/kasirku-sebelum-fix-kiosk-stock-refresh.db` (167.936 bytes) — backup lama lain tidak ditimpa.

---

## KRITERIA SELESAI

| # | Kriteria | Status |
|---|---|---|
| 1 | Kiosk memperoleh stok terbaru setelah perubahan eksternal | ✅ (grid → 5 & → 7 setelah refresh) |
| 2 | Tidak ada polling agresif | ✅ (0 request saat idle 6 detik) |
| 3 | Tidak ada infinite fetch/useEffect loop | ✅ (efek fetch deps `[]`, tanpa timer) |
| 4 | Validasi stok backend tetap pengaman terakhir | ✅ (`server.ts:2022` tidak diubah; menolak qty 3 saat stok 2) |
| 5 | Cart tidak rusak | ✅ (qty tidak pernah diubah diam-diam; cancel/gagal tetap utuh) |
| 6 | Checkout tetap bekerja | ✅ (sukses → 1 transaksi, stok 10 → 7) |
| 7 | Double checkout protection tetap PASS | ✅ (klik ganda → tepat 1 transaksi) |
| 8 | Idempotency tetap PASS | ✅ (key sama → id sama, 1 transaksi) |
| 9 | Tidak ada perubahan dashboard/laporan/diskon/pajak/Telegram | ✅ |
| 10 | `tsc` PASS | ✅ |
| 11 | `build` PASS | ✅ |
| 12 | `integrity_check` PASS | ✅ |
| 13 | Data produksi tidak terhapus | ✅ (16 metrik AFTER == BEFORE) |
| 14 | Semua data test dibersihkan | ✅ (0 artefak, 0 data uji) |

**Status: SELESAI — FINDING-2 saja. Finding-3 s/d Finding-7 tidak disentuh.**
