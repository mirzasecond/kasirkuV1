# LAPORAN FIX — FINDING-3: Keranjang Kiosk Persist di Browser Storage

- **Scope:** hanya FINDING-3 (*KioskPage cart in-memory → hilang saat refresh browser*).
- **Status:** SELESAI — 1 file diubah, 54 PASS / 0 FAIL, DB kembali baseline 17/17.
- **Tanggal:** 2026-10-01

---

## 1. Root Cause (temuan audit)

`KioskPage` menyimpan keranjang sebagai state React murni:

```tsx
const [cart, setCart] = useState<CartItem[]>([]);   // hanya hidup di memori tab ini
```

Tidak ada tulis/baca ke `localStorage` maupun server. Konsekuensinya:

| Aksi | Sebelum fix |
|---|---|
| Refresh (F5) / Ctrl+R / restore tab | keranjang **kosong total** |
| Salah pindah tab lalu browser membuang tab | keranjang **kosong total** |
| Reload saat review pesanan sebelum bayar | kasir harus **mengetik ulang semua item** |

Ini **masalah frontend saja** — tidak ada endpoint, tabel, maupun kolom baru yang dibutuhkan. Cart hanya memuat `id`, `code`, `quantity`.

## 2. File yang diubah

**Hanya satu file:** `src/pages/KioskPage.tsx`

| Baris | Isi |
|---|---|
| 82 | `CART_STORAGE_KEY = 'kasirku_kiosk_cart'` |
| 84–89 | `interface StoredCartItem { id; code; quantity }` |
| 91–112 | `readStoredCart()` — try/catch, validasi array & tipe; JSON rusak → `[]` |
| 114–132 | `writeStoredCart()` — tulis **minimal field** saja; cart kosong → `removeItem`; quota error ditelan agar Kiosk tidak crash |
| 137–186 | `restoreCartItems(stored, products)` → `{ items, missing, overStock }` |
| 188 | `const [receiptCart, setReceiptCart] = useState<CartItem[]>([])` — snapshot struk |
| 204 | `cartRestorePendingRef` — cegah efek persistensi menimpa storage sebelum restore |
| 213–214 | efek persistensi: tulis storage setiap `cart` berubah (kecuali saat restore) |
| 251–276 | blok restore sekali-jalan di dalam `refreshProducts()` |
| 529–534 | checkout **sukses**: `setReceiptCart(cart)` → `setCart([])` → `writeStoredCart([])` |
| 556 | `closeReceiptAndReset()` juga mengosongkan `receiptCart` |
| 790 | `<ReceiptPreview ... cart={receiptCart} />` (bukan `cart`) |

**Tidak diubah:** `server.ts`, `CheckoutModal.tsx`, `ReceiptPreview.tsx`, skema DB, endpoint checkout, sistem idempotency, sistem refresh stok Finding-2, discount/laporan/dashboard/`is_test`/Telegram/audit log.

## 3. Mekanisme persistence (keputusan desain)

| Keputusan | Nilai | Alasan |
|---|---|---|
| Key | `kasirku_kiosk_cart` | mengikuti konvensi project (`kasirku_token`, `kasirku_user`), bukan `kasirku:kiosk-cart` |
| Format | JSON array `[{id, code, quantity}]` | hanya data minimal; **tidak ada** harga, stok, nama, token, user, atau data sensitif |
| Ditulis | setiap `cart` berubah (tambah/hapus/qty) | perubahan kasir langsung aman |
| Dihapus | saat cart kosong & saat checkout sukses | tidak ada sisa data yang tersimpan |
| Gagal baca | `[]` (tenang) | storage rusak ≠ crash |
| Gagal tulis | ditelan (try/catch) | quota penuh tidak menjatuhkan kiosk |
| Harga / stok / status | **selalu dari server saat restore** | mencegah harga & stok basi |

## 4. Perilaku restore (pintar, tidak buta)

`restoreCartItems()` mencocokkan item tersimpan ke daftar produk dari server (lewat `id`, fallback `code`):

- ✅ cocok → kembalikan `quantity` apa adanya (**tidak pernah di-clamp**);
- ⚠️ `quantity` > stok server → masuk `overStock`, diberi peringatan `alert` berisi angka keranjang vs stok server, item tetap ada (kasir yang memutuskan), **server tetap penentu akhir** saat checkout;
- ❌ id/code tidak ada atau produk non-aktif → masuk `missing`, **dikeluarkan dari cart**, `alert` menyebut nama/kode produknya, storage dinormalkan;
- ❌ **tidak pernah** membuat request checkout otomatis — restore hanya `setState` + tulis storage.

Restore dijalankan sekali dari `refreshProducts()` (setelah produk pertama dimuat), dijaga `cartRestorePendingRef` supaya efek persistensi tidak menimpa storage dengan cart lama.

## 5. Struk setelah checkout sukses

`ReceiptPreview` membaca item & subtotal dari **prop `cart`**, sedangkan total/pajak/diskon dari objek `transaction`. Bila `cart` dikosongkan begitu saja, struk akan jadi kosong walaupun transaksi sukses. Karena itu disediakan snapshot `receiptCart` yang diisi **sebelum** `cart` dikosongkan — struk tetap lengkap, keranjang tetap bersih, storage ikut kosong.

## 6. Hasil 12 test wajib — **54 PASS, 0 FAIL**

| # | Test wajib | Hasil | Bukti |
|---|---|---|---|
| 1 | Add product → storage berisi `{id,code,quantity}` | **PASS** (3) | `[{id:317,code:"TMP-CART3",quantity:2}]`, key persis `code,id,quantity` |
| 2 | Refresh → cart kembali | **PASS** (4) | cart `[2]` kembali; storage `quantity:2`; **0 request checkout**; hanya 1 request produk |
| 3 | Ubah quantity → storage ikut | **PASS** (4) | `2→3` di state & storage; setelah refresh tetap `[3]` |
| 4 | Hapus item → tetap hilang setelah refresh | **PASS** (3) | qty `3→0` → item terhapus → storage `null` → refresh tetap `[]` |
| 5 | Checkout sukses → cart+storage kosong, transaksi 1× | **PASS** (7) | cart `[]`, storage `null`, tx `1→2`, stok `10→8` (sekali), 0 alert tak terduga, refresh setelah struk tetap `[]` |
| 6 | Checkout gagal → cart utuh & bisa retry | **PASS** (6) | cart `[3]`, storage `quantity:3`, tx `2→2`, modal tetap terbuka, `idempotency` pending `0` |
| 7 | Double-click Konfirmasi → tepat 1 transaksi | **PASS** (4) | tx `2→3` (tepat +1), 1 stock_movement, stok `10→7`, cart & storage kosong |
| 8 | API 2× key idempotency sama → 1 transaksi | **PASS** (3) | 201/201, id sama `3fc55v47zgjic5xbqcioi`, tx +1 |
| 9 | Stale stock → server tetap menolak | **PASS** (8) | cart hasil restore `[3]`, stok lokal = **2 (dari server)**, alert restore jelas, buka checkout tanpa peringatan ganda, server tolak `Stok ... tidak mencukupi`, cart utuh, stok tidak negatif |
| 10 | Storage rusak (`{rusak...`) → tidak crash | **PASS** (4) | grid tetap tampil, cart `[]`, storage dibersihkan jadi `null`, 0 alert |
| 11 | Item id tidak ada / produk non-aktif → informasi jelas | **PASS** (5) | `Produk berikut sudah tidak tersedia atau tidak aktif dan dihapus dari keranjang: TMP-CART3, PRODUK-HAPUS...`, cart `[]`, storage `null`, **0 checkout otomatis** |
| 12 | Idle 6 detik → 0 request | **PASS** (2) | `productsReq=0`, `txPost=0` (tanpa polling) |
| — | Setup baseline (cart & storage bersih) | **PASS** (1) | `{"c":[],"s":null}` |
| | **TOTAL** | **54 PASS / 0 FAIL** | |

## 7. Regresi

| Bagian | Hasil | Bukti |
|---|---|---|
| **Finding-1** — double click | **PASS** (4 assert) | tepat **1** transaksi, 1 stock_movement, stok terpotong sekali (`10→7`), cart & storage kosong |
| **Finding-1** — API idempotency | **PASS** (3 assert) | dua request paralel key sama → 201/201 + id transaksi sama + tepat 1 transaksi baru |
| **Finding-2** — stok basi | **PASS** (8 assert) | stok lokal dari server (`2`, bukan dari storage), peringatan restore, buka checkout tidak memunculkan peringatan ganda, server tetap menolak, stok tidak negatif |
| **Finding-2** — tanpa polling | **PASS** | idle 6 detik → 0 request produk & 0 request transaksi |

## 8. Kualitas kode

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | **OK** (tanpa error) |
| `npm run build` | **OK** → `dist/assets/index-DiXv8vRJ.js` (1.263 kB), `dist/assets/index-vVk4yyM2.css` |
| Bundle hash | tidak berubah (kode sama dengan build sebelum test — perubahan sudah ter-build sebelum pengujian) |
| Line ending / komentar | mengikuti gaya file yang ada; tanpa komentar baru yang tidak perlu |

## 9. Integritas database setelah cleanup

Backup dibuat **sebelum** perubahan apa pun (server stop, file ditutup):
`data/backups/kasirku-sebelum-fix-kiosk-cart-persistence.db` (167.936 bytes).

Perbandingan baseline (sebelum data uji dibuat) vs setelah cleanup — **17/17 identik**:

| Metrik | BEFORE | AFTER |
|---|---|---|
| products | 122 | **122** |
| users | 2 | **2** |
| transactions | 0 | **0** |
| transaction_items | 0 | **0** |
| stock_movements | 0 | **0** |
| discount_rules | 0 | **0** |
| notifications_queue | 14 | **14** |
| audit_log | 108 | **108** |
| checkout_idempotency | 0 | **0** |
| products (status Aktif) | 119 | **119** |
| produk `TMP-%` / user `tmp%` | 0 | **0** |
| `is_test = 1` | 0 | **0** |
| orphan item / movement | 0 | **0** |
| idempotency `pending` | 0 | **0** |
| `PRAGMA integrity_check` | ok | **ok** |
| `PRAGMA foreign_key_check` | none | **none** |

Yang dihapus saat cleanup (marker-based, tanpa DELETE global): produk `TMP-CART3`, user `tmpcart3`, 4 transaksi uji + items + movements, 8 notifikasi (`%Cart Persistence%` / `%TMP-CART3%`), 12 baris audit (user `tmp-cart3-user-01` atau product 317), semua baris `checkout_idempotency` (baseline 0).

Setelah restart: `GET /api/dashboard/summary` → **revenue 0, transactions 0, itemsSold 0, grossProfit 0** (today & yesterday); `top-products` → `[]`; `GET /api/products?status=Aktif` → **119**.

## 10. Data uji (sudah dibersihkan)

| Data | Nilai |
|---|---|
| Produk | `TMP-CART3` / `TMPCART3` / "Produk Test Cart Persistence" / harga 15.000 / stok 10 |
| User | `tmpcart3` / `Cart3Persist!` (role `cashier`, id `tmp-cart3-user-01`) |
| Transaksi | 4 (semua `is_test = 1`) — dihapus saat cleanup |

## 11. Artefak & pembersihan

- 7 file sementara dibuat lalu **dihapus**: `tmp-cart3-count.cjs`, `tmp-cart3-setup.cjs`, `tmp-cart3-test.cjs`, `tmp-cart3-cleanup.cjs`, `tmp-cart3-schema.cjs`, `tmp-cart3-notif.cjs`, `tmp-cart3-before.json`.
- Verifikasi akhir: pencocokan `tmp-*` → **No files found**; `write-test-*` → **No files found**.
- Chrome headless uji dimatikan; server dikembalikan hidup (port 3000) untuk operasional.
- **Catatan penting:** pembersihan artefak sengaja memakai daftar nama eksplisit, **bukan** pola luas `gen-*`. Pada task sebelumnya pola luas itu tidak sengaja menghapus `node_modules/@jridgewell/gen-mapping/dist/*` dan membuat build gagal (pulih dengan `npm ci`, `package.json` + `package-lock.json` tidak berubah).

## 12. Daftar backup (semua dipertahankan)

| File | Bytes |
|---|---|
| `data/backups/kasirku-sebelum-fix-kiosk-cart-persistence.db` | 167.936 (backup task ini) |
| `data/backups/kasirku-sebelum-fix-kiosk-stock-refresh.db` | 167.936 (Finding-2) |
| `data/backups/kasirku-sebelum-fix-double-checkout.db` | (Finding-1) |
| + backup historis lain di `data/backups/` | tidak disentuh |

---

# Out of Scope Finding

Masalah berikut terlihat selama pengerjaan tetapi **berada di luar Finding-3**, sehingga **tidak diperbaiki** sesuai batasan task.

1. **Endpoint produk tanpa autentikasi.** `server.ts:1814` (`POST /api/products`), `server.ts:1873` (`PUT /api/products/:id`), `server.ts:1946` (`DELETE /api/products/:id`), dan `server.ts:426` (`GET /api/products`) tidak memiliki middleware auth, sementara endpoint import produk memakai `adminOnly` (`server.ts:836`, `server.ts:853`). Konsekuensinya siapa pun yang bisa mencapai port 3000 dapat mengubah/menghapus data produk tanpa login. *Dampak langsung ke task ini: tidak ada — justru dipakai untuk mengatur stok dari luar saat test.* Perbaikannya menyentuh keamanan backend di luar scope.

2. **`ReceiptPreview` bergantung pada prop `cart`.** Komponen (`src/components/ReceiptPreview.tsx:333` untuk subtotal, `:395` untuk daftar item) tidak menerima snapshot transaksi untuk item-nya, sehingga mengosongkan `cart` akan mengosongkan tampilan struk. Di task ini disiasati dari sisi KioskPage dengan snapshot `receiptCart` (lihat poin 5) **tanpa mengubah** `ReceiptPreview`. Perbaikan di komponennya sendiri (mis. membaca item dari `transaction.items`) adalah perbaikan terpisah.

3. **Web Storage tidak sinkron antar tab.** Dua tab Kiosk yang sama akan saling menimpa isi `kasirku_kiosk_cart` (bukan `storage` event / cross-tab listener). Tidak diperbaiki: butuh desain multi-tab yang di luar scope, dan perilaku sebelumnya (kedua tab kehilangan cart) sudah lebih buruk.

4. **Tidak ada tombol hapus pencarian.** `searchTerm` (`src/pages/KioskPage.tsx:167`) hanya punya state & filter (`:366`, `:378`) tanpa tombol *clear* — kasir harus menghapus ketikan manual. Murni UX, di luar Finding-3.

5. **Tidak ada indikator "cart dipulihkan" yang permanen.** Feedback restore memakai `alert()` mengikuti pola pesan yang sudah ada di file (peringatan stok dsb.), sehingga setelah OK informasi hilang. Alternatif yang lebih baik (toast/banner yang menempel) memerlukan komponen notifikasi lintas halaman — di luar scope.

6. **Penyimpanan cart di perangkat, bukan di server.** Jika kasir berganti perangkat/browser, cart tidak ikut pindah. Itu memang batas desain Finding-3 (persistensi *browser storage*, tanpa endpoint baru).
