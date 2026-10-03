import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CreditCard, RefreshCw, Loader2 } from 'lucide-react';

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

const localToday = () => new Date().toLocaleDateString('sv-SE');

const AdminTransaksiPage: React.FC = () => {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await axios.get(`${API}/api/transactions?date=${localToday()}&limit=200`);
      setTxs(res.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const total = txs.reduce((s, t) => s + (t.grand_total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" /> Transaksi Hari Ini
          </h1>
          <p className="text-sm text-gray-500">Semua transaksi hari ini dari seluruh kasir</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total Transaksi</p>
          <p className="text-2xl font-bold text-gray-800">{txs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total Omset Hari Ini</p>
          <p className="text-2xl font-bold text-blue-600">{rupiah(total)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Rata-rata / Transaksi</p>
          <p className="text-2xl font-bold text-gray-800">{rupiah(txs.length ? total / txs.length : 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : txs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Belum ada transaksi hari ini
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
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
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

export default AdminTransaksiPage;
