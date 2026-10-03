import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, X, Barcode, Printer, Layers, Package, PaintBucket, Wrench, Box, QrCode } from 'lucide-react';
import Modal from '../components/Modal';
import CheckoutModal from '../components/CheckoutModal';
import ReceiptPreview from '../components/ReceiptPreview';
import KioskNotification from '../components/KioskNotification';
import type { KioskNotificationItem, KioskNotify, KioskNotifyType } from '../components/KioskNotification';
import { useAuth } from '../auth/AuthContext';

interface Product {
  id: number;
  code: string;
  description: string;
  brand: string | null;
  status: 'Aktif' | 'Tidak Aktif';
  note: string | null;
  category: string;
  variant: string | null;
  thickness: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  minimum_stock: number;
  barcode: string | null;
  qr_code: string | null;
  active: boolean;
}

interface CartItem extends Product {
  quantity: number;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Flooring': <Layers size={18} />,
  'Semen & Perekat': <Package size={18} />,
  'Cat & Finishing': <PaintBucket size={18} />,
  'Besi & Logam': <Wrench size={18} />,
  'Panel Dinding': <Layers size={18} />,
  'Lainnya': <Box size={18} />,
};

// ---- FIX FINDING-2: sinkronkan stok di keranjang dengan data terbaru ------
// Mengembalikan referensi array YANG SAMA bila tidak ada perubahan, sehingga
// efek fetchTotals (diskon/pajak) tidak ikut terpicu tanpa alasan.
// Quantity TIDAK PERNAH diubah diam-diam: bila jumlah di keranjang melebihi
// stok terbaru, kasir diberi peringatan, dan server tetap penolak terakhir.
function syncCartStock(
  cart: CartItem[],
  fresh: Product[]
): { next: CartItem[]; warnings: string[] } {
  if (cart.length === 0) return { next: cart, warnings: [] };
  const byId = new Map<number, Product>(fresh.map((p) => [p.id, p]));
  let changed = false;
  const warnings: string[] = [];
  const next = cart.map((item) => {
    const p = byId.get(item.id);
    // Produk tidak ada lagi di daftar aktif: dibiarkan apa adanya (isi keranjang
    // tidak dihapus sembarangan) — server yang menolak saat checkout.
    if (!p) return item;
    const newStock = Number(p.stock) || 0;
    if (newStock === Number(item.stock)) return item;
    changed = true;
    if (item.quantity > newStock) {
      warnings.push(
        `Stok "${item.description}" berubah dari ${item.stock} menjadi ${newStock}, ` +
          `sedangkan jumlah di keranjang adalah ${item.quantity}. ` +
          `Kurangi jumlah sebelum checkout — server akan menolak bila stok tidak mencukupi.`
      );
    }
    return { ...item, stock: newStock };
  });
  return { next: changed ? next : cart, warnings };
}

// ---- FIX FINDING-3: persistensi keranjang Kiosk ---------------------------
// Sebelumnya cart hanya hidup di `useState`, sehingga refresh halaman / buka
// tab baru langsung menghapusnya. Disimpan MINIMAL: { id, code, quantity } —
// tanpa harga, tanpa stok, tanpa token/password/user/data pembayaran. Saat
// restore, data produk diambil ulang dari server, jadi localStorage tidak
// pernah menjadi sumber kebenaran harga/stok/diskon/total.
// Key mengikuti konvensi project (`kasirku_token`, `kasirku_user`).
const CART_STORAGE_KEY = 'kasirku_kiosk_cart';

interface StoredCartItem {
  id: number;
  code: string;
  quantity: number;
}

/** Baca storage dengan aman. JSON rusak / tipe salah → anggap kosong (tanpa throw). */
function readStoredCart(): StoredCartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: StoredCartItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const id = Number((entry as any).id);
      const quantity = Number((entry as any).quantity);
      const code = typeof (entry as any).code === 'string' ? (entry as any).code : '';
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!Number.isInteger(quantity) || quantity < 1) continue;
      out.push({ id, code, quantity });
    }
    return out;
  } catch {
    return []; // malformed JSON / storage diblokir → cart kosong, Kiosk tetap jalan
  }
}

/** Tulis minimal. Storage penuh/di-block tidak boleh menjatuhkan Kiosk. */
function writeStoredCart(items: CartItem[]): void {
  try {
    const minimal: StoredCartItem[] = items.map((i) => ({
      id: i.id,
      code: i.code,
      quantity: i.quantity,
    }));
    if (minimal.length === 0) {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(minimal));
  } catch {
    /* abaikan — cart tetap berfungsi di memori */
  }
}

/**
 * Gabungkan cart tersimpan dengan produk TERBARU dari server.
 * - Item tidak ditemukan / tidak aktif → dikeluarkan + dilaporkan (bukan diam-diam).
 * - quantity TIDAK PERNAH diubah/di-clamp.
 * - selling_price & stock diambil dari server, bukan dari storage.
 */
function restoreCartItems(
  stored: StoredCartItem[],
  products: Product[]
): { items: CartItem[]; missing: string[]; overStock: string[] } {
  const byId = new Map<number, Product>(products.map((p) => [p.id, p]));
  const byCode = new Map<string, Product>(products.map((p) => [p.code, p]));
  const items: CartItem[] = [];
  const missing: string[] = [];
  const overStock: string[] = [];
  for (const s of stored) {
    const p = byId.get(s.id) || (s.code ? byCode.get(s.code) : undefined);
    if (!p || p.status !== 'Aktif' || !p.active) {
      missing.push(s.code || String(s.id));
      continue;
    }
    if (s.quantity > Number(p.stock)) {
      overStock.push(`${p.description} (keranjang ${s.quantity}, stok ${p.stock})`);
    }
    items.push({ ...p, quantity: s.quantity });
  }
  return { items, missing, overStock };
}

// FIX FINDING-4: pesan error jaringan/kesalahan teknis diterjemahkan ke bahasa
// yang mudah dipahami kasir. Pesan dari server (Bahasa Indonesia, mis. "Stok
// tidak mencukupi") diteruskan apa adanya — tanpa stack trace / detail teknis.
const TECHNICAL_ERROR = /failed to fetch|networkerror|load failed|network request failed|unexpected token|json/i;
function friendlyError(error: unknown, fallback: string): string {
  const raw = String((error as { message?: string })?.message || '').trim();
  if (!raw) return fallback;
  if (TECHNICAL_ERROR.test(raw)) return 'Koneksi bermasalah. Periksa jaringan lalu coba lagi.';
  return raw;
}

const KioskPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<'cash' | 'card' | 'qris'>('cash');
  const [lastPaymentAmount, setLastPaymentAmount] = useState<number>(0);
  const [lastCashierName, setLastCashierName] = useState<string>('Unknown');
  const [barcodeFocused, setBarcodeFocused] = useState(false);
  const [inputBarcodeValue, setInputBarcodeValue] = useState('');
  // Tax amount shown in the UI, sourced from the backend (single source of truth).
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0.11);
  // Automatic discount from active rules, sourced from the backend so the UI
  // matches exactly what checkout stores (no local hardcoded 0).
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountRuleName, setDiscountRuleName] = useState<string>('');

  // FIX FINDING-3: snapshot isi keranjang SAAT checkout sukses, dipakai untuk
  // merender struk. Dengan begini `cart` boleh dikosongkan segera setelah
  // server mengonfirmasi (state + storage bersih) tanpa merusak isi struk.
  const [receiptCart, setReceiptCart] = useState<CartItem[]>([]);

  // ---- FIX FINDING-4: notifikasi non-blocking pengganti window.alert() ----
  // State lokal KioskPage (bukan global store). Pesan TIDAK dihapus saat cart
  // berubah — hanya hilang lewat auto-dismiss atau tombol tutup.
  const [notifications, setNotifications] = useState<KioskNotificationItem[]>([]);
  const notify = useCallback<KioskNotify>((message: string, type: KioskNotifyType = 'info') => {
    setNotifications((prev) => {
      // Pesan identik dengan tipe sama ditumpuk (bukan dobel) → timer di-reset.
      const withoutDupes = prev.filter((n) => !(n.message === message && n.type === type));
      const item: KioskNotificationItem = {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        message,
      };
      // Batasi tumpukan agar tidak pernah menutupi layar.
      return [...withoutDupes, item].slice(-4);
    });
  }, []);
  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);


  // ---- KUNCI CHECKOUT (mencegah transaksi ganda) -------------------------
  // `isCheckoutSubmitting` mengunci tombol Konfirmasi di modal (state → UI).
  // `checkoutLockRef` adalah guard SINKRON: state React bisa belum ter-update
  // saat klik kedua datang di tick yang sama, ref langsung bernilai true.
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false);
  const checkoutLockRef = useRef(false);
  // Idempotency-Key: satu key untuk satu aksi checkout. Dipertahankan saat
  // gagal (retry memakai key yang sama) dan diganti saat isi keranjang berubah
  // atau checkout sukses — sehingga transaksi berbeda tidak pernah berbagi key.
  const checkoutIdemKeyRef = useRef<string | null>(null);

  // FIX FINDING-3: restore cart dari localStorage baru boleh terjadi SETELAH
  // produk pertama kali tersedia. Flag ini juga mencegah efek persistensi
  // menimpa storage dengan [] sebelum sempat dibaca.
  const cartRestorePendingRef = useRef(true);

  useEffect(() => {
    checkoutIdemKeyRef.current = null;
  }, [cart]);

  // FIX FINDING-3: setiap perubahan cart (tambah / ubah quantity / hapus /
  // kosongkan) langsung dipersist. Satu titik tulis → tidak ada yang terlewat.
  useEffect(() => {
    if (cartRestorePendingRef.current) return; // jangan menimpa sebelum restore
    writeStoredCart(cart);
  }, [cart]);

  const BACKEND_URL = 'http://localhost:3000';

  // ---- REFRESH DATA PRODUK (FIX FINDING-2) --------------------------------
  // Sebelumnya produk hanya diambil SEKALI saat mount, sehingga stok yang
  // tampil bisa basi bila berubah dari Admin/kasir lain. Refresh berbasis
  // EVENT (bukan polling, tanpa setInterval/useEffect loop):
  //   1) saat Kiosk dibuka           → syncCart=true (keranjang masih kosong)
  //   2) saat checkout dibuka        → syncCart=true (stok terkini + peringatan)
  //   3) sesudah checkout sukses     → syncCart=false (grid saja, tak ganggu struk)
  //   4) sesudah checkout gagal      → syncCart=true (stok yang bikin gagal)
  const refreshProducts = useCallback(
    (opts?: { syncCart?: boolean }) => {
      const shouldSyncCart = opts?.syncCart ?? true;
      (async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/products?status=Aktif`, {
            // Ambilan segar dari server — jangan pakai cache peramban.
            cache: 'no-store',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          // Handle both direct array and object with products field
          const productsArray = Array.isArray(data)
            ? data
            : (data?.products || []);

          setProducts(productsArray);

          // ---- FIX FINDING-3: restore keranjang dari storage (sekali saja,
          // saat data produk pertama kali tersedia) ----------------------
          // Hanya mengisi STATE: tidak ada request checkout otomatis, tidak ada
          // perubahan stok, tidak ada tulisan ke backend. Harga/stock/total
          // semuanya diambil dari `productsArray` (respons server).
          if (cartRestorePendingRef.current) {
            cartRestorePendingRef.current = false;
            if (cart.length === 0) {
              const stored = readStoredCart();
              const restored = restoreCartItems(stored, productsArray);
              if (restored.items.length > 0) setCart(restored.items);
              // Normalisasi: buang entri rusak/tak-valid dari storage.
              writeStoredCart(restored.items);
              if (restored.missing.length > 0) {
                notify(
                  'Produk berikut sudah tidak tersedia atau tidak aktif dan dihapus dari keranjang: ' +
                    restored.missing.join(', ') +
                    '. Silakan pilih produk kembali sebelum melakukan checkout.',
                  'warning'
                );
              }
              if (restored.overStock.length > 0) {
                notify(
                  'Jumlah di keranjang melebihi stok terkini untuk: ' +
                    restored.overStock.join('; ') +
                    '. Kurangi jumlah sebelum checkout — server tetap menolak bila stok tidak mencukupi.',
                  'warning'
                );
              }
            } else {
              // Cart sudah terisi sebelum data produk sempat dimuat → langsung
              // sinkronkan storage supaya tidak menunggu perubahan berikutnya.
              writeStoredCart(cart);
            }
          }

          if (shouldSyncCart) {
            // Peringatan dihitung di luar updater React (updater harus murni);
            // updater sendiri memakai `prev` terbaru agar tidak ada update
            // keranjang yang tertimpa.
            const { warnings } = syncCartStock(cart, productsArray);
            setCart((prev) => syncCartStock(prev, productsArray).next);
            warnings.forEach((w) => notify(w, 'warning'));
          }
        } catch (error) {
          // Refresh GAGAL: data lama dan keranjang TETAP dipertahankan.
          // Kiosk tidak crash, cart tidak dihapus, dan checkout tetap bisa
          // berjalan — validasi stok di server tetap pengaman terakhir.
          console.error('Failed to refresh products:', error);
        }
      })();
    },
    [cart, notify]
  );

  // Mount: ambil produk terbaru seperti sebelumnya (sekali saja, deps []).
  useEffect(() => {
    refreshProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buka checkout: tarik stok terkini SEBELUM kasir membayar. Tidak memblokir
  // modal dan tidak menghapus/mengubah isi keranjang.
  const openCheckout = useCallback(() => {
    // FIX FINDING-4: cart kosong → beri umpan balik non-blocking, modal tidak
    // dibuka, dan TIDAK ada request apa pun (nol transaksi).
    if (cart.length === 0) {
      notify('Keranjang kosong. Tambahkan produk terlebih dahulu sebelum checkout.', 'warning');
      return;
    }
    setShowCheckoutModal(true);
    void refreshProducts();
  }, [refreshProducts, notify, cart.length]);

  // Fetch the automatic discount AND tax from the backend so the numbers shown
  // to the cashier are IDENTICAL to what the server stores on checkout.
  useEffect(() => {
    const fetchTotals = async () => {
      try {
        const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);

        // 1) Automatic discount from active rules (send full cart lines so
        // category/product-scoped rules compute correctly).
        let autoDiscount = 0;
        try {
          const cartLines = cart.map((item) => ({
            product_code: item.code,
            category: item.category,
            quantity: item.quantity,
            unit_price: item.selling_price,
            subtotal: item.selling_price * item.quantity,
          }));
          const dRes = await fetch(
            `${BACKEND_URL}/api/discounts/preview?items=${encodeURIComponent(JSON.stringify(cartLines))}`
          );
          if (dRes.ok) {
            const dData = await dRes.json();
            autoDiscount = Number(dData.discountAmount) || 0;
            setDiscountRuleName(dData.ruleName || '');
          }
        } catch (e) {
          console.error('Failed to fetch discount:', e);
        }
        setDiscountAmount(autoDiscount);

        // 2) Tax on the discounted amount
        const taxableAmount = Math.max(0, subtotal - autoDiscount);
        const res = await fetch(`${BACKEND_URL}/api/tax?subtotal=${taxableAmount}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTaxAmount(Number(data.tax_amount) || 0);
        if (typeof data.tax_rate === 'number') setTaxRate(data.tax_rate);
      } catch (error) {
        console.error('Failed to fetch totals from backend:', error);
      }
    };
    fetchTotals();
  }, [cart]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    // Normalisasi spasi agar "EV2001" menemukan "EV 2001" (kode data nyata
    // gudang mengandung spasi, hasil scan/ketik sering tanpa spasi).
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const q = norm(searchTerm);
    return products.filter(product => {
      const matchesSearch =
        !q ||
        norm(product.description).includes(q) ||
        norm(product.code).includes(q) ||
        (product.barcode ? norm(product.barcode).includes(q) : false);

      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const addToCart = (product: Product) => {
    // FIX FINDING-4: pemeriksaan & notifikasi dilakukan DI LUAR updater React
    // (side effect tidak boleh ada di dalam updater) — keputusan sama persis
    // seperti sebelumnya.
    if (!(Number(product.selling_price) > 0)) {
      notify(`Harga jual "${product.description}" belum diisi. Lengkapi di menu Produk (Admin) sebelum menjual.`, 'error');
      return;
    }
    if (Number(product.stock) <= 0) {
      notify('Stok habis.', 'warning');
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing && existing.quantity >= product.stock) {
      notify('Stok habis.', 'warning');
      return;
    }
    setCart(prev => {
      const found = prev.find(item => item.id === product.id);
      if (found) {
        if (found.quantity >= product.stock) {
          return prev;
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    const index = cart.findIndex(item => item.id === id);
    if (index === -1) return;
    const item = cart[index];
    const newQty = item.quantity + delta;
    // FIX FINDING-4: notifikasi dipanggil di luar updater.
    if (newQty > item.stock) {
      notify('Jumlah melebihi stok tersedia.', 'warning');
      return;
    }
    setCart(prev => {
      const i = prev.findIndex(x => x.id === id);
      if (i === -1) return prev;
      const current = prev[i];
      const qty = current.quantity + delta;
      if (qty <= 0) {
        return prev.filter((_, idx) => idx !== i);
      }
      if (qty > current.stock) {
        return prev;
      }
      const updated = [...prev];
      updated[i] = { ...current, quantity: qty };
      return updated;
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  // Automatic discount comes from the backend (active discount_rules), not from
  // a local input. Falls back to 0 only if no rule applies.
  const discount = discountAmount;
  const taxableAmount = Math.max(0, subtotal - discount);
  // Tax is NOT computed here. It comes from the backend (single source of truth)
  // via taxAmount state, fetched from GET /api/tax using the SAME TaxService
  // that checkout uses. `Math.floor` mirrors the backend so preview == stored.
  const tax = taxAmount;
  const total = taxableAmount + tax;

  const handleCheckout = async (paymentMethod: 'cash' | 'card' | 'qris', paymentAmount?: number) => {
    // KUNCI KLIK GANDA: bila request checkout masih berjalan, klik berikutnya
    // langsung diabaikan (guard sinkron, tidak menunggu render ulang).
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    setIsCheckoutSubmitting(true);
    try {
      // DEBUG: Check user data before checkout
      console.log('=== KIOSK PAGE - BEFORE CHECKOUT ===');
      console.log('Current User:', user);
      console.log('User ID:', user?.id);
      console.log('User Name:', user?.name);
      
      // For cash payments, if no amount provided, use total
      const actualPaymentAmount = paymentMethod === 'cash' && !paymentAmount 
        ? Math.ceil(total) // Round up to nearest integer
        : (paymentAmount || total);
      
      // BUG 2 FIX: never send an underpaid checkout. Guard here as well so any
      // caller (not just the modal) cannot create a transaction with negative
      // change. Server also rejects this with HTTP 400 as the source of truth.
      if (actualPaymentAmount < total) {
        notify('Uang pembayaran kurang', 'error');
        return;
      }
      
      // Every transaction must belong to a logged-in cashier (backend also
      // verifies the token), so block anonymous checkouts up front.
      if (!user) {
        notify('Sesi kasir belum login. Silakan login terlebih dahulu.', 'error');
        window.location.href = '/kiosk/login';
        return;
      }

      const requestBody = {
        items: cart.map(i => ({ 
          product_id: i.id, 
          quantity: i.quantity, 
          price: i.selling_price 
        })),
        payment_method: paymentMethod,
        payment_amount: actualPaymentAmount,
        discount,
        cashier_id: user.id,
        cashier_name: user.name,
      };
      
      console.log('Request Body being sent:', requestBody);

      // Buat Idempotency-Key untuk aksi checkout INI bila belum ada (retry
      // setelah gagal memakai key yang sama; isi keranjang berubah → key baru).
      if (!checkoutIdemKeyRef.current) {
        checkoutIdemKeyRef.current =
          typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
            ? (crypto as any).randomUUID()
            : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      }

      const token = localStorage.getItem('kasirku_token');
        const res = await fetch(`${BACKEND_URL}/api/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            // IDEMPOTENCY: satu key untuk satu aksi checkout. Key yang sama
            // dipakai ulang saat retry, sehingga server dapat mendeteksi
            // duplikat walau jaringan mengulang request yang sama.
            ...(checkoutIdemKeyRef.current
              ? { 'Idempotency-Key': checkoutIdemKeyRef.current }
              : {}),
          },
          body: JSON.stringify(requestBody),
        });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Transaksi gagal');

      console.log('=== KIOSK PAGE - AFTER CHECKOUT SUCCESS ===');
      console.log('Response Data:', data);
      console.log('Transaction from response:', data.transaction);
      console.log('Transaction cashier_name:', data.transaction?.cashier_name);
      
      setLastTransaction(data.transaction);
      setLastPaymentMethod(paymentMethod);
      setLastPaymentAmount(actualPaymentAmount);
      // Try to get cashier name from transaction user info
      setLastCashierName(data.transaction?.cashier_name || data.transaction?.user?.name || data.transaction?.username || 'Unknown');
      // Checkout sukses → key dipakai habis. Transaksi berikutnya (keranjang
      // baru) harus memakai key baru agar tidak dianggap duplikat.
      checkoutIdemKeyRef.current = null;
      // FIX FINDING-3: server SUDAH mengonfirmasi → bersihkan cart dari state
      // DAN browser storage. Struk memakai snapshot `receiptCart` (isi cart
      // saat submit) sehingga tampilan struk tidak berubah. Pembersihan hanya
      // terjadi di jalur sukses ini — checkout gagal tidak menyentuh cart.
      setReceiptCart(cart);
      setCart([]);
      writeStoredCart([]);
      setShowCheckoutModal(false);
      setShowReceiptModal(true);
      // FIX FINDING-4: umpan balik sukses non-blocking (struk tetap terbuka).
      notify(
        data.transaction?.reference_no
          ? `Transaksi berhasil — ${data.transaction.reference_no}`
          : 'Transaksi berhasil.',
        'success'
      );
      // Checkout sukses → ambil stok terbaru untuk grid. `syncCart: false`
      // agar refresh tidak menyentuh keranjang (sudah kosong) maupun struk.
      void refreshProducts({ syncCart: false });
    } catch (error: any) {
      // Gagal → key TETAP disimpan agar retry memakai key yang sama; server
      // sudah melepas klaimnya sehingga retry tetap diproses normal.
      // FIX FINDING-4: pesan gagal jadi notifikasi non-blocking; cart tidak
      // disentuh sehingga kasir bisa langsung mencoba lagi.
      notify(friendlyError(error, 'Transaksi gagal. Coba lagi.'), 'error');
      // Penyebab paling umum: stok berubah di tempat lain → segarkan tampilan
      // (bila stok naik/turun, kasir langsung melihat angka yang benar).
      void refreshProducts();
    } finally {
      checkoutLockRef.current = false;
      setIsCheckoutSubmitting(false);
    }
  };

  const closeReceiptAndReset = () => {
    setShowReceiptModal(false);
    setCart([]);
    setReceiptCart([]);
    setInputBarcodeValue('');
  };

  const handleBarcodeClick = () => {
    setBarcodeFocused(true);
    setInputBarcodeValue('');
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputBarcodeValue.trim()) {
      // Pencocokan tahan spasi: kode di data nyata mengandung spasi
      // ("EV 2001"), sedangkan hasil scan/ketikan bisa tanpa spasi.
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
      const q = norm(inputBarcodeValue.trim());
      const exactMatch = products.find(p =>
        norm(p.barcode || '') === q || norm(p.code) === q
      );
      
      if (exactMatch) {
        addToCart(exactMatch);
        setInputBarcodeValue('');
      } else {
        // Jika tidak ada exact match, filter dan tampilkan hasil pencarian
        setSearchTerm(inputBarcodeValue.trim());
        setInputBarcodeValue('');
      }
    }
  };

  // Keyboard shortcut F9 for checkout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // FIX FINDING-4: guard cart kosong dipindah ke openCheckout() supaya F9
      // dan tombol memberi umpan balik yang sama (non-blocking).
      if (e.key === 'F9' && !showCheckoutModal) {
        e.preventDefault();
        openCheckout();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCheckoutModal, openCheckout]);

  useEffect(() => {
    if (barcodeFocused) {
      document.getElementById('barcode-input')?.focus();
      setBarcodeFocused(false);
    }
  }, [barcodeFocused]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Beranda Content */}
      <main className="flex-1 overflow-hidden p-6">
        {/* Search Bar dengan Icon Barcode/QR */}
        <div className="mb-6 max-w-2xl">
          <div className="flex gap-2">
            <input
              id="barcode-input"
              type="text"
              value={inputBarcodeValue}
              onChange={(e) => setInputBarcodeValue(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Scan barcode / ketik nama atau kode produk..."
              className="flex-1 pl-4 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
            <button
              onClick={() => setBarcodeFocused(true)}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="Focus barcode scanner"
            >
              <Barcode size={24} />
            </button>
            <button
              onClick={() => setBarcodeFocused(true)}
              className="p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              title="Focus QR scanner"
            >
              <QrCode size={24} />
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center gap-2">
                {CATEGORY_ICONS[category] || <Box size={18} />}
                {category}
              </span>
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto mr-96 pr-4">
          {filteredProducts.map(product => {
            const noPrice = !(Number(product.selling_price) > 0);
            const outOfStock = Number(product.stock) <= 0;
            const blocked = noPrice || outOfStock || !product.active;
            return (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={blocked}
              title={noPrice ? 'Harga jual belum diisi' : outOfStock ? 'Stok habis' : !product.active ? 'Produk tidak aktif' : ''}
              className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed flex flex-col justify-between min-h-[180px]"
            >
              <div className="flex-1">
                <div className="font-semibold text-sm mb-1 line-clamp-2">{product.description}</div>
                {product.brand && (
                  <div className="text-xs text-gray-500 mb-1 truncate">{product.brand}</div>
                )}
                <div className="text-xs text-gray-500 mb-2 truncate" title={product.code}>Kode: {product.code}</div>
                {product.note && (
                  <div className="text-xs text-gray-600 mb-2 line-clamp-2" title={product.note}>{product.note}</div>
                )}
              </div>
              <div>
                {noPrice ? (
                  <div className="font-semibold text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                    Harga belum diisi
                  </div>
                ) : (
                  <div className="font-bold text-blue-600">Rp {(product.selling_price).toLocaleString('id-ID')}</div>
                )}
                <div className={`text-xs mt-1 ${outOfStock ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                  Stok: {product.stock} {product.unit}
                </div>
              </div>
            </button>
            );
          })}
        </div>

        {/* Cart Panel */}
        <div className="fixed right-0 top-0 h-full w-96 md:w-[28rem] bg-white shadow-lg p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart /> Keranjang
            </h2>
            <button
              onClick={() => setCart([])}
              className="text-red-600 hover:text-red-800"
              disabled={cart.length === 0}
            >
              <X />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 mb-4">
            {cart.length === 0 ? (
              <p className="text-center text-gray-500 mt-10">Keranjang kosong</p>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="font-semibold text-sm truncate">{item.description}</div>
                    <div className="text-xs text-gray-600">Rp {item.selling_price.toLocaleString('id-ID')} x {item.quantity}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                      disabled={item.quantity >= item.stock}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>Rp {subtotal.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span>Diskon{discountRuleName ? ` (${discountRuleName})` : ''}:</span>
              <span>-Rp {discount.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span>Pajak ({(taxRate * 100).toLocaleString('id-ID')}%):</span>
              <span>Rp {tax.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span>Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <button
            onClick={openCheckout}
            className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            Checkout Sekarang
          </button>
        </div>
      </main>

      {/* Add no-print class to hide this content during printing */}
      <div className="no-print">
        {/* Modals */}
        <CheckoutModal
          isOpen={showCheckoutModal}
          onClose={() => setShowCheckoutModal(false)}
          total={total}
          onCheckout={handleCheckout}
          submitting={isCheckoutSubmitting}
          notify={notify}
        />

        <ReceiptPreview
          isOpen={showReceiptModal}
          onClose={closeReceiptAndReset}
          transaction={lastTransaction}
          total={total}
          cart={receiptCart}
          discount={discount}
          paymentMethod={lastPaymentMethod}
          paymentAmount={lastPaymentAmount}
          cashierName={lastCashierName}
          notify={notify}
        />

        {/* FIX FINDING-4: pengganti window.alert() — non-blocking, role aksesibel,
            di atas modal (z-[60] > z-50) supaya pesan checkout tetap terlihat. */}
        <KioskNotification notifications={notifications} onDismiss={dismissNotification} />
      </div>
    </div>
  );
};

export default KioskPage;
