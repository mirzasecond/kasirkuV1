import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Clock, Filter, Loader2, X } from 'lucide-react';

const API = 'http://localhost:3000';

interface TxItem {
  id: string;
  product_name: string;
  quantity: number;
}

interface Tx {
  id: string;
  reference_no: string;
  date_time: string;
  cashier_name?: string;
  grand_total: number;
  items: TxItem[];
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const AdminRiwayatPage: React.FC = () => {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [cashiers, setCashiers] = useState<string[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [cashier, setCashier] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (start && end) {
        params.set('start', start);
        params.set('end', end);
      }
      if (cashier) params.set('cashier', cashier);
      const res = await axios.get(`${API}/api/transactions?${params.toString()}`);
      setTxs(res.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    axios.get(`${API}/api/cashiers`).then((r) => setCashiers(r.data.cashiers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, cashier]);

  const reset = () => {
    setStart('');
    setEnd('');
    setCashier('');
  };

  const total = txs.reduce((s, t) => s + (t.grand_total || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Clock className="w-6 h-6 text-blue-600" /> Riwayat Transaksi
        </h1>
        <p className="text-sm text-gray-500">Semua transaksi historis dari seluruh kasir</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kasir</label>
            <select
              value={cashier}
              onChange={(e) => setCashier(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Kasir</option>
              {cashiers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
          >
            <X className="w-4 h-4" /> Reset
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            Menampilkan <span className="font-semibold text-gray-700">{txs.length}</span> transaksi
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Jumlah Transaksi</p>
          <p className="text-2xl font-bold text-gray-800">{txs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total Omset</p>
          <p className="text-2xl font-bold text-blue-600">{rupiah(total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : txs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Tidak ada riwayat transaksi pada filter ini
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No Transaksi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kasir</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {txs.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-800">{t.reference_no}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {new Date(t.date_time).toLocaleString('id-ID', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600">{t.cashier_name || '-'}</td>
                  <td className="px-6 py-3 text-sm text-center text-gray-600">{t.items?.length || 0}</td>
                  <td className="px-6 py-3 text-sm text-right font-semibold text-blue-600">{rupiah(t.grand_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminRiwayatPage;
