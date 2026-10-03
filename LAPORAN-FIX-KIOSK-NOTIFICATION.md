# LAPORAN FIX — FINDING-4: Mengganti `alert()` Blocking pada Kiosk

- **Scope:** hanya FINDING-4 (*penggunaan JavaScript `alert()` yang blocking pada Kiosk*).
- **Status:** SELESAI — 4 file (3 diubah + 1 baru), **58 PASS / 0 FAIL**, DB kembali baseline 17/17.
- **Tanggal:** 2026-10-01
- **Tidak disentuh:** backend checkout, idempotency/double-checkout (Finding-1), refresh stok (Finding-2), cart persistence (Finding-3), discount, laporan, dashboard, `is_test`, Telegram, audit log, skema database.

---

## 1. Root cause Finding-4

Semua umpan balik di flow Kiosk memakai **`window.alert()`**, yaitu *modal sistem operasi* yang:

- **Memblokir main thread browser** — event loop berhenti sampai kasir menekan OK; tombol/scroll/ketikan lain mati sementara.
- **Tidak bisa ditata ulang** — satu pesan pada satu waktu, tanpa perbedaan visual error/warning/success, tanpa tombol tutup, tanpa `role` untuk screen reader.
- **Terputus oleh interaksi lain** — tidak ada jangka waktu, dan sebaliknya tidak bisa dibiarkan tetap terlihat sambil kasir melanjutkan pekerjaan.

Karena itu pengalaman kasir saat stok berubah, checkout gagal, atau struk dicetak adalah *jeda paksa* yang menghentikan alur kerja.

## 2. Daftar penggunaan `alert()` yang ditemukan (audit statis)

Total **13 `alert()`** di `src/` (dipindai 51 file `.ts`/`.tsx`, komentar dikecualikan) — **semuanya di flow Kiosk**.

| # | File : baris | Pesan | Kondisi pemicu | Jenis | Terkait checkout |
|---|---|---|---|---|---|
| 1 | `KioskPage.tsx:260` | Produk tidak tersedia/nonaktif… dihapus dari keranjang | Restore cart dari storage menemukan id/code yang tak ada | Informasi/Warning | **Sebelum** (persiapan) |
| 2 | `KioskPage.tsx:267` | Jumlah di keranjang melebihi stok terkini… | Restore cart, `quantity` > stok server | Warning | **Sebelum** |
| 3 | `KioskPage.tsx:286` | Stok "…" berubah dari X menjadi Y… | `syncCartStock()` mendeteksi stok berubah (Finding-2) | Warning | **Dalam** (modal terbuka) |
| 4 | `KioskPage.tsx:382` | Harga jual "…" belum diisi… | `addToCart` saat `selling_price <= 0` | Error | Sebelum (tambah item) |
| 5 | `KioskPage.tsx:386` | Stok habis. | `addToCart` saat `stock <= 0` | Warning | Sebelum |
| 6 | `KioskPage.tsx:393` | Stok habis. | `addToCart`, qty sudah ≥ stok | Warning | Sebelum |
| 7 | `KioskPage.tsx:417` | Jumlah melebihi stok tersedia. | `updateQuantity` saat `newQty > item.stock` | Warning | Sebelum |
| 8 | `KioskPage.tsx:460` | Uang pembayaran kurang | `handleCheckout`, `paymentAmount < total` (guard server) | Error | **Dalam** checkout |
| 9 | `KioskPage.tsx:467` | Sesi kasir belum login… | `handleCheckout`, `!user` | Error | **Dalam** checkout |
| 10 | `KioskPage.tsx:543` | `error.message` / Transaksi gagal. Coba lagi. | `catch` setelah `POST /api/transactions` gagal | Error | **Sesudah** request (checkout gagal) |
| 11 | `CheckoutModal.tsx:44` | Masukkan jumlah uang bayar | `handleCheckout` modal, input kosong | Warning | **Dalam** checkout |
| 12 | `CheckoutModal.tsx:49` | Uang pembayaran kurang | `handleCheckout` modal, `cash < total` | Error | **Dalam** checkout |
| 13 | `ReceiptPreview.tsx:322` | Popup blocker is preventing the print dialog… | `printReceipt()`, `window.open()` diblokir | Warning | **Sesudah** checkout (cetak struk) |

**`alert()` di area NON-Kiosk: 0.**

**`confirm()` — diaudit, TIDAK diubah** (sesuai aturan #8, karena `confirm()` mengembalikan keputusan user):

| File : baris | Pesan | Alasan tidak diubah |
|---|---|---|
| `AdminPage.tsx:135` | Yakin ingin menghapus produk ini? | butuh `true/false` |
| `AdminDiskonPage.tsx:183` | Hapus diskon "…"? | butuh `true/false` |
| `AdminImportPage.tsx:154` | Impor N produk ke database? | butuh `true/false` |
| `AdminRolePage.tsx:105` | Hapus role "…"? | butuh `true/false` |
| `AdminTelegramPage.tsx:119` | Hapus semua notifikasi yang sudah diproses? | butuh `true/false` |
| `AdminUserPage.tsx:101` | Hapus user "…"? | butuh `true/false` |
| `KioskSettingsPage.tsx:296` | Reset all settings to default? | butuh `true/false` |

Tidak ada `confirm()` di `KioskPage`, `CheckoutModal`, maupun `ReceiptPreview`.

## 3. File yang diubah

| File | Status | Perubahan |
|---|---|---|
| `src/components/KioskNotification.tsx` | **BARU** | Komponen notifikasi + tipe `KioskNotify` |
| `src/pages/KioskPage.tsx` | diubah | state `notifications`, `notify`, `dismissNotification`, `friendlyError`, 10 `alert` → `notify`, render `<KioskNotification>`, prop `notify` ke 2 anak |
| `src/components/CheckoutModal.tsx` | diubah | prop `notify`, 2 `alert` → `notify`, peringatan bayar kurang saat ketik, `role="alert"` pada kotak inline |
| `src/components/ReceiptPreview.tsx` | diubah | prop `notify`, 1 `alert` → `notify` |

Rincian `KioskPage.tsx`:

| Baris | Isi |
|---|---|
| 7–8 | import komponen + tipe |
| 162–170 | `friendlyError(error, fallback)` — pesan jaringan → bahasa ramah kasir |
| 203–220 | state `notifications`, `notify()` (dedup per `message`+`type`, tumpukan maks 4), `dismissNotification()` |
| 295, 303 | pesan restore cart (Finding-3) → `notify(..., 'warning')` |
| 323 | peringatan stok (Finding-2) → `notify(..., 'warning')` |
| 345–352 | `openCheckout()`: cart kosong → `notify` + return (tanpa request) |
| 424–447 | `addToCart`: pemeriksaan dipindah **ke luar** updater React, lalu `notify` |
| 455–478 | `updateQuantity`: idem |
| 514, 521 | guard bayar kurang & sesi belum login → `notify(..., 'error')` |
| 591–596 | checkout **sukses** → `notify(..., 'success')` |
| 606 | checkout **gagal** → `notify(friendlyError(...), 'error')` |
| 650–661 | shortcut F9 tidak lagi memeriksa cart (guard pindah ke `openCheckout`) |
| 797, 806 | `notify={notify}` dikirim ke `CheckoutModal` dan `ReceiptPreview` |
| 865 | render `<KioskNotification>` |

Perilaku UI yang berubah (hanya UX, nol perubahan bisnis):

1. Tombol **"Checkout Sekarang"** tidak lagi `disabled` saat cart kosong — kliknya kini memberi pesan non-blocking (sebelumnya: tombol mati tanpa umpan balik).
2. Shortcut **F9** dengan cart kosong kini juga memberi pesan yang sama.
3. Peringatan "uang kurang" muncul **saat kasir mengetik nominal**, bukan hanya lewat kotak inline.
4. Pesan error jaringan (`Failed to fetch` dsb.) diterjemahkan → *"Koneksi bermasalah. Periksa jaringan lalu coba lagi."* (tanpa stack trace / detail teknis).
5. Side effect `notify` dipindah keluar dari updater React (`addToCart`/`updateQuantity`) — keputusan & pesan identik, hanya lokasinya yang benar.

## 4. Mekanisme notification yang digunakan

**Tidak ada dependency baru.** Satu komponen lokal `src/components/KioskNotification.tsx`.

Catatan penting tentang "komponen toast yang sudah ada": project **sudah punya idiom** `notify(msg, type)` + state `toast` di **9 halaman Admin** (`AdminBackupPage`, `AdminDiskonPage`, `AdminImportPage`, `AdminPajakPage`, `AdminPengaturanPage`, `AdminRolePage`, `AdminTelegramPage`, `AdminUserPage`, `StockInPage`) — tetapi semuanya **diimplementasi ulang per halaman**, bukan komponen bersama, dan hanya punya `success`/`error`, tanpa `role`, tanpa tombol tutup, satu pesan pada satu waktu.

Karena itu Kiosk mengikuti **API & posisi yang sama** (`notify(message, type)`, `fixed … z-[60]`, ikon lucide) namun memakai satu komponen bersama karena pesannya harus muncul dari **3 komponen** (KioskPage, CheckoutModal, ReceiptPreview). Ini **bukan** sistem notification kedua — halaman Admin tidak disentuh.

| Aspek | Keputusan |
|---|---|
| API | `notify(message, type)` — identik dengan idiom halaman Admin |
| Tipe | `success`, `error`, `warning`, `info` (4, bukan 2) |
| `role` | `error`/`warning` → **`role="alert"`**; `success`/`info` → **`role="status"`** |
| Auto-dismiss | success 4 dtk, info 5 dtk, warning **8 dtk**, error **10 dtk** (pesan checkout tidak hilang cepat) |
| Tutup manual | tombol `X` dengan `aria-label="Tutup pesan …"`, `focus-visible:ring` |
| Posisi | `fixed inset-x-0 top-0 z-[60]`, kartu `max-w-xl` — di atas modal (`z-50`) |
| Gaya | latar terang + teks gelap + border-kiri (mengikuti kotak `bg-red-100 text-red-700`/`bg-green-100` yang sudah ada), bukan putih-di-atas-warna agar kontras tetap tinggi |
| Anti-tumpuk | pesan `message`+`type` identik ditumpuk (timer di-reset), maks **4** kartu |
| Isolasi | state terpisah dari `cart` → **pesan tidak hilang saat cart berubah** |
| Klik-through | container & kartu `pointer-events-none`; hanya tombol `X` yang `pointer-events-auto` → notifikasi tidak pernah memblokir area di bawahnya |
| Tanpa fokus paksa | komponen tidak memanggil `.focus()` → perpindahan fokus tidak mengganggu |

## 5. Hasil verifikasi (bukti, menggantikan screenshot)

Tidak ada tangkapan layar; berikut cuplikan output verifikasi otomatis (Chrome headless 1440×900, build produksi):

```
E  notifikasi : {"role":"alert","text":"PerhatianKeranjang kosong. Tambahkan produk terlebih dahulu sebelum checkout."}
E  geom.      : btn {x:992,y:725,w:400,h:48}  kartu {x:420,y:16,w:576,h:57}  intersects:false
E  overflow   : baseline {"sw":1433,"cw":1416} == saat notifikasi {"sw":1433,"cw":1416}
B  notifikasi : {"role":"status","text":"BerhasilTransaksi berhasil — TRX-1790855147893-8A3FD803"}
C  peringatan : {"role":"alert","text":"PerhatianStok "Produk Test Notifikasi" berubah dari 8 menjadi 2, sedangkan jumlah di keranjang adalah 3. …"}
C  error      : {"role":"alert","text":"GagalStok Produk Test Notifikasi tidak mencukupi"}
D  error      : {"role":"alert","text":"GagalUang pembayaran kurang"}
H  restore    : {"role":"alert","text":"PerhatianJumlah di keranjang melebihi stok terkini untuk: Produk Test Notifikasi (keranjang 2, stok 1). …"}
K  restore    : {"role":"alert","text":"PerhatianProduk berikut sudah tidak tersedia atau tidak aktif dan dihapus dari keranjang: PRODUK-TIDAK-ADA. …"}
```

Pengukuran perilaku (dijalankan terpisah untuk memastikan):

- Auto-dismiss **warning = 8.1 dtk** (polling per detik → kartu hilang di detik ke-8).
- **Enter pada tombol close** (difokus + `Input.dispatchKeyEvent`) → kartu tertutup.
- Nol `Page.javascriptDialogOpening` sepanjang seluruh suite.

## 6. Test case + PASS/FAIL — **58 PASS, 0 FAIL**

| Test | Kasus | Hasil | Bukti |
|---|---|---|---|
| **A** | Static audit `alert(` | **PASS** (3) | 0 pemanggilan `alert()` di 51 file `src/` (komentar dikecualikan); 7 `confirm()` tercatat & tidak diubah |
| **B** | Checkout sukses | **PASS** (9) | notifikasi sukses `role="status"` + struk tetap muncul + cart & storage kosong (Finding-3) + 1 transaksi + stok `10→8` + **auto-dismiss 4 dtk** |
| **C** | Checkout gagal | **PASS** (12) | error `role="alert"`; cart `[3]` & storage `quantity:3` utuh; 0 transaksi; modal tetap terbuka (retry); idempotency `pending=0`; pesan **tetap ada** saat modal ditutup **dan** saat cart berubah `3→2` |
| **D** | Pembayaran kurang | **PASS** (5) | notifikasi "Uang pembayaran kurang" `role="alert"`; kotak inline tetap ada; tombol Konfirmasi `disabled=true`; **0 request transaksi** |
| **E** | Cart kosong | **PASS** (9) | notifikasi non-blocking `role="alert"`; modal tidak terbuka; 0 transaksi; **0 overflow tambahan**; tidak menutupi tombol checkout; kartu `pointer-events-none`; close button `aria-label` + bisa difokus; input barcode tetap bisa difokus; **Enter menutup notifikasi** |
| **F** | Finding-1: double-click 0 ms | **PASS** (5) | tepat **1** transaksi, stok terpotong sekali (`10 - qty`), notifikasi sukses, cart & storage kosong, **0 dialog browser** |
| **G** | Finding-2: stok eksternal | **PASS** (2) | grid menampilkan stok **10** (dari server); 0 peringatan ganda |
| **H** | Finding-3: persistensi | **PASS** (3) | reload → cart `[2]` kembali; storage `quantity:2`; pesan restore tampil sebagai notifikasi |
| **I** | No blocking | **PASS** (1) | `Page.javascriptDialogOpening` = **0** untuk seluruh suite (alert/confirm/prompt tidak pernah muncul) |
| **J** | No polling | **PASS** (2) | idle 6 dtk → 0 request produk, 0 request transaksi |
| — | Setup baseline | **PASS** (1) | cart kosong, storage kosong, tanpa notifikasi |
| | **TOTAL** | **58 PASS / 0 FAIL** | |

## 7. Bukti Finding-1 tetap PASS

- **F** — klik `Konfirmasi` dua kali pada tick yang sama → `tx 4 → 5` (**tepat +1**), stok terpotong sekali, idempotency `pending=0`, nol dialog browser.
- Klaim idempotency tidak digantung saat checkout gagal (**C**: `idem_pending=0`).
- Tidak ada perubahan pada `checkoutLockRef`, `isCheckoutSubmitting`, `Idempotency-Key`, maupun `server.ts`.

## 8. Bukti Finding-2 tetap PASS

- **C** — stok diubah eksternal `8 → 2` → buka checkout → peringatan muncul **sebagai notifikasi** dengan teks asli `Stok "…" berubah dari 8 menjadi 2…`; mekanisme `syncCartStock`/`refreshProducts` tidak diubah (hanya `alert` → `notify`).
- **G** — stok diubah eksternal menjadi 10 → buka checkout → grid menampilkan **10** (server sumber kebenaran), tanpa peringatan ganda.
- **J** — tidak ada polling baru: 0 request saat idle 6 dtk.

## 9. Bukti Finding-3 tetap PASS

- **B** — checkout sukses → `cart=[]` **dan** storage `null`, struk tetap terisi dari `receiptCart`.
- **C** — checkout gagal → `cart=[3]`, storage `[{id:318,quantity:3}]` **tidak hilang**, retry dimungkinkan.
- **H** — reload → cart dipulihkan (`[2]`), storage `quantity:2`.
- **K** — id tak ada di storage → pesan jelas, item dikeluarkan, storage dinormalkan ke `null`, **0 checkout otomatis**.

## 10. tsc / build / integrity

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | **OK** |
| `npm run build` (`tsc && vite build`) | **OK** → `dist/assets/index-zUk3TrFO.js` (1.266,75 kB), `dist/assets/index-ozcUIGAx.css` |
| 2772 modul ter-transformasi | ✓ |
| `PRAGMA integrity_check` | **ok** |
| `PRAGMA foreign_key_check` | **none** |

## 11. Kondisi database setelah cleanup

Data uji (semua dihapus berdasarkan marker, **tanpa `DELETE` global**): produk `TMP-ALERT4` (id 318), user `tmpalert4`, 5 transaksi `is_test=1` + items + movements, 14 notifikasi (marker `%TMP-ALERT4%` / `%Produk Test Notifikasi%` / `%User Uji Notifikasi%`), 13 baris audit (user `tmp-alert4-user-01` / product 318), 5 baris `checkout_idempotency`.

Perbandingan **BEFORE vs AFTER — 17/17 identik:**

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
| integrity / fk_check | ok / none | **ok / none** |

Verifikasi setelah restart: dashboard **revenue 0, transactions 0, itemsSold 0, grossProfit 0**; `top-products` = **0**; `GET /api/products?status=Aktif` = **119**.

Audit log & notifikasi **produksi tidak tersentuh** (hanya baris dengan marker data uji yang dihapus).

## 12. Backup yang dibuat

| File | Bytes | Waktu |
|---|---|---|
| `data/backups/kasirku-sebelum-fix-kiosk-alert.db` | **172.032** | sebelum modifikasi apa pun, server stop |
| `data/backups/kasirku-sebelum-fix-kiosk-cart-persistence.db` | 167.936 | task Finding-3 (dipertahankan) |
| `data/backups/kasirku-sebelum-fix-kiosk-stock-refresh.db` | 167.936 | task Finding-2 (dipertahankan) |
| `data/backups/kasirku-sebelum-fix-double-checkout.db` | — | task Finding-1 (dipertahankan) |

**Artefak:** 8 file `tmp-alert4-*` dibuat lalu dihapus; verifikasi akhir `tmp-*` → **No files found**. Chrome headless uji dimatikan; server kembali hidup di port 3000.

## 13. Out of Scope Finding

Ditemukan selama pengerjaan, **tidak diperbaiki** sesuai batasan task:

1. **Horizontal overflow pre-existing pada layout Kiosk.** `document.documentElement.scrollWidth = 1433` > `clientWidth = 1416` — disebabkan oleh kerangka aplikasi (`div.flex-1 … lg:m…`, `header`, `main` dengan `right = 1433`), **bukan** oleh notifikasi (pengukuran dengan/tanpa notifikasi identik `1433/1416`). Perbaikannya menyentuh layout utama yang di luar scope.
2. **`confirm()` pada 7 lokasi** (6 halaman Admin + `KioskSettingsPage.tsx:296`). Sengaja tidak diubah karena mengembalikan keputusan user; menggantinya dengan notifikasi akan menghilangkan keputusan tersebut.
3. **9 duplikasi implementasi toast di halaman Admin.** Setiap halaman mendefinisikan ulang `toast`+`notify` dengan `z-50`/`z-[60]` tidak konsisten, tanpa `role`, tanpa tombol tutup, dan hanya 2 tipe. Menyatukannya ke satu komponen global adalah refactor lintas halaman (di luar scope).
4. **`handleCheckout` modal: guard `cashPaid` kosong (`CheckoutModal.tsx:44`) hampir tak terjangkau** karena tombol Konfirmasi sudah `disabled` saat input kosong/kurang. Guard tetap dipertahankan sebagai pertahanan lapis, dan umpan balik yang terlihat kini berupa kotak inline + notifikasi saat mengetik.
5. **Log debug `console.log` yang tersisa** di `KioskPage` (`=== KIOSK PAGE - BEFORE CHECKOUT ===`, body request) dan `ReceiptPreview` (`=== RECEIPT PREVIEW COMPONENT ===`) mencetak data transaksi/user ke console. Tidak memengaruhi UI, tetapi berisik di produksi — di luar scope.
6. **Pesan popup-blocker cetak (`ReceiptPreview.tsx:322`) diubah dari bahasa Inggris ke Indonesia** agar konsisten dengan pesan Kiosk lainnya (perubahan teks UX, bukan logika).
7. **Tidak ada jeda "hover untuk menahan auto-dismiss"** pada kartu notifikasi — hanya auto-dismiss + tombol tutup, sesuai batasan perubahan minimal.
