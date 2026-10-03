import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Percent,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Tag,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface Discount {
  id: number;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  start_date: string | null;
  end_date: string | null;
  days_of_week: string | null;
  min_purchase: number | null;
  max_discount: number | null;
  active: number;
  scope_type?: 'all' | 'category' | 'products' | null;
  scope_value?: string | null;
}

interface ProductLite {
  id: number;
  code: string;
  description: string;
  category: string | null;
}

const DAYS = [
  { v: '0', l: 'Min' },
  { v: '1', l: 'Sen' },
  { v: '2', l: 'Sel' },
  { v: '3', l: 'Rab' },
  { v: '4', l: 'Kam' },
  { v: '5', l: 'Jum' },
  { v: '6', l: 'Sab' },
];

const emptyForm = {
  name: '',
  description: '',
  discount_type: 'percentage' as 'percentage' | 'fixed',
  discount_value: '',
  start_date: '',
  end_date: '',
  days_of_week: [] as string[],
  min_purchase: '',
  max_discount: '',
  active: true,
  scope_type: 'all' as 'all' | 'category' | 'products',
  scope_category: '',
  scope_products: [] as string[],
};

const AdminDiskonPage: React.FC = () => {
  const [rules, setRules] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const [res, prodRes] = await Promise.all([
        axios.get(`${API}/api/discounts`),
        axios.get(`${API}/api/products`),
      ]);
      setRules(res.data.discounts || []);
      setProducts(prodRes.data.products || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    const scopeType = (d.scope_type || 'all') as 'all' | 'category' | 'products';
    let scopeProducts: string[] = [];
    let scopeCategory = '';
    if (scopeType === 'products' && d.scope_value) {
      try { const arr = JSON.parse(d.scope_value); if (Array.isArray(arr)) scopeProducts = arr.map(String); } catch { /* ignore */ }
    } else if (scopeType === 'category' && d.scope_value) {
      scopeCategory = d.scope_value;
    }
    setForm({
      name: d.name,
      description: d.description || '',
      discount_type: d.discount_type,
      discount_value: String(d.discount_value),
      start_date: d.start_date || '',
      end_date: d.end_date || '',
      days_of_week: d.days_of_week ? d.days_of_week.split(',').map((s) => s.trim()).filter(Boolean) : [],
      min_purchase: d.min_purchase != null ? String(d.min_purchase) : '',
      max_discount: d.max_discount != null ? String(d.max_discount) : '',
      active: d.active === 1,
      scope_type: scopeType,
      scope_category: scopeCategory,
      scope_products: scopeProducts,
    });
    setProductSearch('');
    setShowModal(true);
  };

  const toggleDay = (v: string) => {
    setForm((f: any) => ({
      ...f,
      days_of_week: f.days_of_week.includes(v)
        ? f.days_of_week.filter((d: string) => d !== v)
        : [...f.days_of_week, v],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value),
        min_purchase: form.min_purchase === '' ? 0 : Number(form.min_purchase),
        max_discount: form.max_discount === '' ? null : Number(form.max_discount),
        days_of_week: form.days_of_week.length ? form.days_of_week.join(',') : null,
        scope_type: form.scope_type,
        scope_value:
          form.scope_type === 'category'
            ? form.scope_category
            : form.scope_type === 'products'
            ? form.scope_products
            : null,
      };
      delete payload.scope_category;
      delete payload.scope_products;
      if (editing) {
        await axios.put(`${API}/api/discounts/${editing.id}`, payload);
        notify('Diskon diperbarui', 'success');
      } else {
        await axios.post(`${API}/api/discounts`, payload);
        notify('Diskon ditambahkan', 'success');
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan diskon', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Discount) => {
    if (!confirm(`Hapus diskon "${d.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/discounts/${d.id}`);
      notify('Diskon dihapus', 'success');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menghapus', 'error');
    }
  };

  const toggleActive = async (d: Discount) => {
    try {
      await axios.put(`${API}/api/discounts/${d.id}`, {
        ...d,
        active: d.active !== 1,
        days_of_week: d.days_of_week || null,
      });
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal mengubah status', 'error');
    }
  };

  const describeValue = (d: Discount) =>
    d.discount_type === 'percentage' ? `${d.discount_value}%` : `Rp ${Number(d.discount_value).toLocaleString('id-ID')}`;

  const describeSchedule = (d: Discount) => {
    const parts: string[] = [];
    if (d.start_date || d.end_date) parts.push(`${d.start_date || '...'} s/d ${d.end_date || '...'}`);
    if (d.days_of_week) {
      const labels = d.days_of_week.split(',').map((v) => DAYS.find((x) => x.v === v.trim())?.l || v).join(', ');
      parts.push(`Hari: ${labels}`);
    }
    if (d.min_purchase) parts.push(`Min. Rp ${Number(d.min_purchase).toLocaleString('id-ID')}`);
    return parts.length ? parts.join(' • ') : 'Selalu berlaku';
  };

  const describeScope = (d: Discount) => {
    const type = d.scope_type || 'all';
    if (type === 'category') return `Kategori: ${d.scope_value || '-'}`;
    if (type === 'products') {
      try {
        const arr = JSON.parse(d.scope_value || '[]');
        return `${arr.length} produk terpilih`;
      } catch { return 'Produk tertentu'; }
    }
    return 'Semua produk';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Percent className="w-6 h-6 text-blue-600" /> Diskon & Promo
          </h1>
          <p className="text-sm text-gray-500">Aturan diskon yang berlaku otomatis saat checkout di Kasir</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
        >
          <Plus className="w-4 h-4" /> Tambah Diskon
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Belum ada aturan diskon
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nilai</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Berlaku Untuk</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Syarat</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rules.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                    {d.description && <p className="text-xs text-gray-400">{d.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-blue-600">{describeValue(d)}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">{describeScope(d)}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{describeSchedule(d)}</td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => toggleActive(d)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        d.active === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {d.active === 1 ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => openEdit(d)} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => remove(d)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 text-sm">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-lg">{editing ? 'Edit Diskon' : 'Tambah Diskon'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Diskon *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="mis. Promo Akhir Bulan" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipe *</label>
                  <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="percentage">Persentase (%)</option>
                    <option value="fixed">Nominal (Rp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nilai * {form.discount_type === 'percentage' ? '(%)' : '(Rp)'}
                  </label>
                  <input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={form.discount_type === 'percentage' ? '20' : '10000'} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mulai (opsional)</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selesai (opsional)</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hari Berlaku (opsional)</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        form.days_of_week.includes(d.v) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {d.l}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Kosongkan = berlaku setiap hari</p>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Berlaku Untuk</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { v: 'all', l: 'Semua Produk' },
                    { v: 'category', l: 'Kategori Tertentu' },
                    { v: 'products', l: 'Produk Tertentu' },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setForm({ ...form, scope_type: o.v })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                        form.scope_type === o.v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>

                {form.scope_type === 'category' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pilih Kategori</label>
                    <select
                      value={form.scope_category}
                      onChange={(e) => setForm({ ...form, scope_category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Pilih kategori --</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                {form.scope_type === 'products' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Pilih Produk ({form.scope_products.length} dipilih)
                    </label>
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Cari nama atau kode produk..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {/* Selected chips */}
                    {form.scope_products.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {form.scope_products.map((code: string) => {
                          const p = products.find((x) => x.code === code);
                          return (
                            <span key={code} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                              {p ? p.description : code}
                              <button type="button"
                                onClick={() => setForm({ ...form, scope_products: form.scope_products.filter((c: string) => c !== code) })}
                                className="text-blue-500 hover:text-blue-800">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {products
                        .filter((p) => {
                          const q = productSearch.trim().toLowerCase();
                          if (!q) return true;
                          return p.description.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
                        })
                        .slice(0, 60)
                        .map((p) => {
                          const checked = form.scope_products.includes(p.code);
                          return (
                            <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setForm({
                                    ...form,
                                    scope_products: checked
                                      ? form.scope_products.filter((c: string) => c !== p.code)
                                      : [...form.scope_products, p.code],
                                  })
                                }
                                className="w-4 h-4"
                              />
                              <div className="min-w-0">
                                <p className="text-sm text-gray-700 truncate">{p.description}</p>
                                <p className="text-xs text-gray-400 font-mono">{p.code}</p>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min. Pembelian (opsional)</label>
                  <input type="number" value={form.min_purchase} onChange={(e) => setForm({ ...form, min_purchase: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maks. Diskon (opsional)</label>
                  <input type="number" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="tanpa batas" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="w-4 h-4" />
                Aktifkan diskon ini
              </label>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Batal
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? 'Simpan Perubahan' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-[60] flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminDiskonPage;
