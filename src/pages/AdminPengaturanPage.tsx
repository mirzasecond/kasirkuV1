import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Settings, Save, Loader2, CheckCircle2, AlertCircle, Store, Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API = 'http://localhost:3000';

interface ResetPreview {
  transaction_count: number;
  item_count: number;
  movement_count: number;
}

interface ResetResult {
  deleted_transactions: number;
  deleted_items: number;
  deleted_stock_movements: number;
  stock_restored: boolean;
  products_stock_updated: number;
  backup_filename: string;
  message: string;
}

const AdminPengaturanPage: React.FC = () => {
  const [form, setForm] = useState({
    store_name: '',
    store_address: '',
    store_phone: '',
    receipt_footer: '',
    store_logo: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ---- Zona Berbahaya: reset data transaksi (admin only) ----
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [resetScope, setResetScope] = useState<'all' | 'range'>('all');
  const [resetStart, setResetStart] = useState('');
  const [resetEnd, setResetEnd] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [resetError, setResetError] = useState('');

  const rangeIncomplete = resetScope === 'range' && (!resetStart || !resetEnd);

  useEffect(() => {
    if (!isAdmin || rangeIncomplete) {
      if (!rangeIncomplete) setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setResetError('');
    axios
      .post(`${API}/api/admin/reset-transactions/preview`, {
        scope: resetScope,
        start_date: resetStart,
        end_date: resetEnd,
      })
      .then((res) => { if (!cancelled) setPreview(res.data); })
      .catch((e) => {
        if (!cancelled) {
          setPreview(null);
          setResetError(e.response?.data?.message || 'Gagal menghitung transaksi');
        }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, resetScope, resetStart, resetEnd, rangeIncomplete]);

  const runReset = async () => {
    if (confirmText.trim().toUpperCase() !== 'HAPUS') return;
    setResetting(true);
    setResetError('');
    setResetResult(null);
    try {
      const res = await axios.post(`${API}/api/admin/reset-transactions`, {
        scope: resetScope,
        start_date: resetStart,
        end_date: resetEnd,
        restore_stock: restoreStock,
        confirm: 'HAPUS',
      });
      setResetResult(res.data);
      setConfirmText('');
      setPreview({ transaction_count: 0, item_count: 0, movement_count: 0 });
      notify('Data transaksi berhasil direset', 'success');
    } catch (e: any) {
      setResetError(e.response?.data?.message || 'Gagal mereset data transaksi');
    } finally {
      setResetting(false);
    }
  };


  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await axios.get(`${API}/api/settings`);
      const s = res.data.settings || {};
      setForm({
        store_name: s.store_name || '',
        store_address: s.store_address || '',
        store_phone: s.store_phone || '',
        receipt_footer: s.receipt_footer || '',
        store_logo: s.store_logo || '',
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('File harus berupa gambar', 'error');
      return;
    }
    if (file.size > 700 * 1024) {
      notify('Ukuran gambar maksimal 700KB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, store_logo: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/settings`, form);
      notify('Pengaturan disimpan', 'success');
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Memuat...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" /> Pengaturan
        </h1>
        <p className="text-sm text-gray-500">Profil toko & informasi struk</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center">
              <Store className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-700">Profil Toko</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Toko</label>
            <input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })}
              placeholder="mis. Toko Bangunan Jaya"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo Toko</label>
            <div className="flex items-center gap-4">
              {form.store_logo ? (
                <img src={form.store_logo} alt="Logo" className="w-16 h-16 object-contain border border-gray-200 rounded-lg bg-white" />
              ) : (
                <div className="w-16 h-16 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-300 text-xs">
                  No logo
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="cursor-pointer text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg inline-block w-max">
                  Pilih Gambar
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                {form.store_logo && (
                  <button type="button" onClick={() => setForm({ ...form, store_logo: '' })}
                    className="text-xs text-red-600 hover:underline text-left">
                    Hapus logo
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">PNG/JPG, maks 700KB. Tampil di header struk.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
            <input value={form.store_address} onChange={(e) => setForm({ ...form, store_address: e.target.value })}
              placeholder="mis. Jl. Merdeka No. 10, Jakarta"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
            <input value={form.store_phone} onChange={(e) => setForm({ ...form, store_phone: e.target.value })}
              placeholder="mis. 021-1234567"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Footer Struk</label>
            <input value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              placeholder="mis. Terima kasih atas kunjungan Anda!"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Pengaturan
          </button>
        </div>

        {/* Live preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Pratinjau Struk</h2>
          <div className="bg-gray-50 rounded-lg p-4 text-center font-mono text-xs text-gray-700 space-y-1">
            {form.store_logo && <img src={form.store_logo} alt="logo" className="h-10 mx-auto object-contain" />}
            <div className="font-bold text-sm">{(form.store_name || 'KASIRKU').toUpperCase()}</div>
            {form.store_address && <div>{form.store_address}</div>}
            {form.store_phone && <div>Telp: {form.store_phone}</div>}
            <div className="border-t border-dashed my-2" />
            <div className="text-left space-y-0.5">
              <div className="flex justify-between"><span>Contoh Produk x1</span><span>Rp 50.000</span></div>
              <div className="flex justify-between"><span>Subtotal</span><span>Rp 50.000</span></div>
              <div className="flex justify-between font-bold"><span>TOTAL</span><span>Rp 55.500</span></div>
            </div>
            <div className="border-t border-dashed my-2" />
            <div>{form.receipt_footer || 'Terima kasih atas kunjungan Anda!'}</div>
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            Nilai ini dipakai di struk Kasir (header & footer) secara langsung.
          </div>
        </div>
      </div>

      {/* ---- Zona Berbahaya: Reset Data Transaksi (admin only) ---- */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-red-200 overflow-hidden">
          <div className="bg-red-50 px-6 py-4 flex items-center gap-3 border-b border-red-200">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h2 className="font-bold text-red-700">Zona Berbahaya</h2>
              <p className="text-xs text-red-600">
                Hapus data transaksi testing sebelum aplikasi dipakai live. Tidak dapat dibatalkan.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {resetResult ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-green-700">
                  <ShieldCheck className="w-5 h-5" /> Reset selesai
                </div>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• {resetResult.deleted_transactions} transaksi dihapus ({resetResult.deleted_items} item, {resetResult.deleted_stock_movements} stock movement)</li>
                  <li>• Stok produk: {resetResult.stock_restored ? `dikembalikan pada ${resetResult.products_stock_updated} produk` : 'tidak dikembalikan'}</li>
                  <li>• Backup: <code className="font-mono">{resetResult.backup_filename}</code> (data/backups/)</li>
                </ul>
                <button
                  onClick={() => setResetResult(null)}
                  className="text-sm text-green-700 underline"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <>
                {/* Cakupan */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Cakupan data yang dihapus</label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="reset-scope"
                        checked={resetScope === 'all'}
                        onChange={() => setResetScope('all')}
                        className="w-4 h-4"
                      />
                      Semua transaksi
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="reset-scope"
                        checked={resetScope === 'range'}
                        onChange={() => setResetScope('range')}
                        className="w-4 h-4"
                      />
                      Rentang tanggal
                    </label>
                  </div>

                  {resetScope === 'range' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Dari tanggal</label>
                        <input
                          type="date"
                          value={resetStart}
                          onChange={(e) => setResetStart(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Sampai tanggal</label>
                        <input
                          type="date"
                          value={resetEnd}
                          onChange={(e) => setResetEnd(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Kembalikan stok */}
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreStock}
                    onChange={(e) => setRestoreStock(e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span>
                    <b>Kembalikan stok produk</b>
                    <span className="block text-xs text-gray-500">
                      Stok yang terpotong oleh transaksi terhapus dikembalikan sesuai qty.
                      Penambahan stok manual (stock in) tidak ikut terhapus.
                    </span>
                  </span>
                </label>

                {/* Info jumlah + backup */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-1">
                  {rangeIncomplete ? (
                    <p>Pilih rentang tanggal terlebih dahulu.</p>
                  ) : previewLoading ? (
                    <p className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Menghitung transaksi...</p>
                  ) : preview ? (
                    <>
                      <p>
                        Akan menghapus <b className="text-red-600">{preview.transaction_count} transaksi</b> (
                        {preview.item_count} item, {preview.movement_count} stock movement).
                      </p>
                      <p className="text-xs text-gray-500">
                        Backup database dibuat otomatis sebelum penghapusan (folder data/backups/).
                      </p>
                    </>
                  ) : (
                    <p>Tidak ada data untuk ditampilkan.</p>
                  )}
                </div>

                {resetError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {resetError}
                  </div>
                )}

                {/* Konfirmasi ketat */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Ketik <code className="bg-gray-100 px-1.5 py-0.5 rounded text-red-600 font-bold">HAPUS</code> untuk mengonfirmasi
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="HAPUS"
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
                  />
                </div>

                <button
                  onClick={runReset}
                  disabled={
                    resetting ||
                    previewLoading ||
                    rangeIncomplete ||
                    confirmText.trim().toUpperCase() !== 'HAPUS' ||
                    !preview ||
                    preview.transaction_count === 0
                  }
                  className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  {resetting ? 'Menghapus...' : 'Hapus Data Transaksi'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-50 flex items-center gap-2 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminPengaturanPage;
