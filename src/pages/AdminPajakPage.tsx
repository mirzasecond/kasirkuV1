import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calculator, Save, Loader2, CheckCircle2, AlertCircle, Percent } from 'lucide-react';

const API = 'http://localhost:3000';

const AdminPajakPage: React.FC = () => {
  const [rate, setRate] = useState<number>(0.11);
  const [percent, setPercent] = useState<string>('11');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Example preview
  const [sampleSubtotal, setSampleSubtotal] = useState<string>('100000');

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await axios.get(`${API}/api/tax/rate`);
      const r = Number(res.data.tax_rate);
      setRate(r);
      setPercent(String(+(r * 100).toFixed(4)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const p = Number(percent);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return notify('Persentase harus antara 0 dan 100', 'error');
    }
    setSaving(true);
    try {
      const res = await axios.put(`${API}/api/tax/rate`, { percent: p });
      const r = Number(res.data.tax_rate);
      setRate(r);
      setPercent(String(+(r * 100).toFixed(4)));
      notify(res.data.message || 'Tarif pajak disimpan', 'success');
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan tarif pajak', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sample = Number(sampleSubtotal) || 0;
  const sampleTax = Math.floor(sample * (Number(percent) / 100 || 0));

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
          <Calculator className="w-6 h-6 text-blue-600" /> Pajak
        </h1>
        <p className="text-sm text-gray-500">
          Tarif pajak ini dipakai di Kasir (checkout) dan struk — satu sumber kebenaran.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card: current rate + editor */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
              <Percent className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tarif pajak aktif saat ini</p>
              <p className="text-3xl font-bold text-gray-800">{(rate * 100).toFixed(2)}%</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ubah tarif pajak (%)
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Contoh: isi <span className="font-mono">11</span> untuk PPN 11%.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <AlertCircle className="w-4 h-4 inline mr-1 text-gray-400" />
            Mengubah tarif hanya berlaku untuk transaksi <b>berikutnya</b>. Transaksi lama tidak dihitung ulang.
          </div>
        </div>

        {/* Preview calc */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Simulasi</h2>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subtotal (Rp)</label>
          <input
            type="number"
            value={sampleSubtotal}
            onChange={(e) => setSampleSubtotal(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">Rp {sample.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pajak ({percent || 0}%)</span>
              <span className="font-medium">Rp {sampleTax.toLocaleString('id-ID')}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <span className="text-gray-700 font-semibold">Total</span>
              <span className="font-bold text-blue-600">Rp {(sample + sampleTax).toLocaleString('id-ID')}</span>
            </div>
          </div>
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

export default AdminPajakPage;
