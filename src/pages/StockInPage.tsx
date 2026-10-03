import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  PackagePlus,
  Search,
  Package,
  ArrowDownToLine,
  Loader2,
  CheckCircle2,
  AlertCircle,
  History,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface Product {
  id: number;
  code: string;
  description: string;
  brand?: string | null;
  status?: string;
  category: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  minimum_stock: number;
}

interface Movement {
  id: number;
  product_id: number;
  type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_id: string | null;
  note: string | null;
  created_at: string;
  product_code?: string | null;
  product_name?: string | null;
  unit?: string | null;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const typeColor = (t: string) =>
  t === 'IN' ? 'bg-green-100 text-green-700' : t === 'SALE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';

const StockInPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadProducts = async () => {
    try {
      const res = await axios.get(`${API}/api/products`);
      setProducts(res.data.products || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMovements = async () => {
    try {
      const res = await axios.get(`${API}/api/stock-movements?limit=25`);
      setMovements(res.data.movements || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadProducts();
    loadMovements();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter((p) => p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, products]);

  const pick = (p: Product) => {
    setSelected(p);
    setPrice(String(p.purchase_price));
    setSearch('');
    setQty('');
  };

  const submit = async () => {
    if (!selected) return notify('Pilih produk dulu', 'error');
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity < 1) return notify('Jumlah stok harus bilangan bulat >= 1', 'error');

    setSubmitting(true);
    try {
      await axios.post(`${API}/api/stock-in`, {
        product_id: selected.id,
        quantity,
        purchase_price: price === '' ? undefined : Number(price),
        note: note || undefined,
      });
      notify(`Stok ${selected.description} ditambah ${quantity} ${selected.unit}`, 'success');
      // refresh
      await Promise.all([loadProducts(), loadMovements()]);
      // update selected with new values
      const res = await axios.get(`${API}/api/products`);
      const updated = (res.data.products || []).find((p: Product) => p.id === selected.id);
      if (updated) setSelected(updated);
      setQty('');
      setNote('');
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menambah stok', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-blue-600" /> Tambah Stok
        </h1>
        <p className="text-sm text-gray-500">Masukkan stok barang masuk dan catat pergerakannya</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Product search */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Pilih Produk</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau kode produk..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {!selected && (
              <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pick(p)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700">{p.description}</p>
                      <p className="text-xs text-gray-400">{p.code}</p>
                    </div>
                    <span className="text-xs text-gray-500">{p.stock} {p.unit}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-sm text-gray-400 p-3">Produk tidak ditemukan</p>}
              </div>
            )}

            {/* Selected product preview card */}
            {selected && (
              <div className="mt-4 border border-blue-100 bg-blue-50/50 rounded-lg p-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{selected.description}</p>
                    <p className="text-xs text-gray-500">{selected.code} • {selected.category || '-'}</p>
                    <p className="text-sm mt-1 text-gray-600">
                      Stok saat ini: <span className="font-bold text-gray-800">{selected.stock} {selected.unit}</span>
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">
                  Ganti
                </button>
              </div>
            )}
          </div>

          {/* Input form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Stok Masuk *</label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                  disabled={!selected}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Harga Beli (opsional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Kosongkan bila tidak berubah"
                  disabled={!selected}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <p className="text-xs text-gray-400 mt-1">Update purchase_price bila berubah</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="mis. pembelian dari supplier X"
                disabled={!selected}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </div>

            {selected && qty && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                Stok akan menjadi:{' '}
                <span className="font-bold text-blue-600">
                  {selected.stock + (Number(qty) || 0)} {selected.unit}
                </span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={!selected || submitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              Simpan Stok Masuk
            </button>
          </div>
        </div>

        {/* Right: recent movements */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-indigo-500" /> Pergerakan Stok Terbaru
          </h2>
          {movements.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Belum ada pergerakan stok</p>
          ) : (
            <ul className="space-y-3 max-h-[600px] overflow-y-auto">
              {movements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 border-b border-gray-50 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{m.product_name || `#${m.product_id}`}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(m.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {m.note && <p className="text-xs text-gray-400 italic truncate">"{m.note}"</p>}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${typeColor(m.type)}`}>
                    {m.type === 'IN' ? '+' : m.type === 'SALE' ? '-' : ''}{m.quantity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-50 flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default StockInPage;
