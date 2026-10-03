import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart3,
  DollarSign,
  Percent,
  Receipt,
  Package,
  PiggyBank,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const API = 'http://localhost:3000';

type PeriodKey = 'today' | '7' | '30' | 'custom';

interface Summary {
  start_date: string;
  end_date: string;
  revenue: number;
  discount: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  totalTransactions: number;
  itemsSold: number;
}

interface ChartPoint {
  date: string;
  total_sales: number;
  total_profit: number;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

const AdminLaporanPage: React.FC = () => {
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const params = () => {
    if (period === 'custom' && start && end) return { start, end };
    if (period === 'today') return { days: 1 };
    return { days: Number(period) };
  };

  const load = async () => {
    setLoading(true);
    try {
      const p = params();
      const qs = new URLSearchParams(p as any).toString();
      const [s, c] = await Promise.all([
        axios.get(`${API}/api/reports/summary?${qs}`),
        axios.get(`${API}/api/reports/chart?${qs}`),
      ]);
      setSummary(s.data);
      setChart(c.data.data || []);

      // Detail transactions for the same range (use exact start/end returned)
      const d = s.data;
      const t = await axios.get(
        `${API}/api/transactions?start=${d.start_date}&end=${d.end_date}&limit=500`
      );
      setTxs(t.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, start, end]);

  const Card: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; sub?: string }> = ({
    title, value, icon, color, sub,
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {icon}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" /> Laporan
        </h1>
        <p className="text-sm text-gray-500">Ringkasan & detail transaksi per periode</p>
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { k: 'today', label: 'Hari Ini' },
            { k: '7', label: '7 Hari' },
            { k: '30', label: '30 Hari' },
            { k: 'custom', label: 'Custom' },
          ].map((b) => (
            <button
              key={b.k}
              onClick={() => setPeriod(b.k as PeriodKey)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                period === b.k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {b.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date" value={start} onChange={(e) => setStart(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-gray-400">s/d</span>
              <input
                type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
          {summary && (
            <span className="ml-auto text-xs text-gray-400">
              Periode: {summary.start_date} s/d {summary.end_date}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat laporan...
        </div>
      ) : (
        <>
          {/* 5 summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <Card title="Omset" value={rupiah(summary?.revenue || 0)} color="text-blue-600" icon={<DollarSign className="w-6 h-6 text-blue-500" />} />
            <Card title="Diskon" value={rupiah(summary?.discount || 0)} color="text-orange-500" icon={<Percent className="w-6 h-6 text-orange-400" />} />
            <Card title="Pajak" value={rupiah(summary?.tax || 0)} color="text-gray-700" icon={<Receipt className="w-6 h-6 text-gray-400" />} />
            <Card title="Modal" value={rupiah(summary?.cogs || 0)} color="text-purple-600" icon={<Package className="w-6 h-6 text-purple-500" />} />
            <Card
              title="Gross Profit"
              value={rupiah(summary?.grossProfit || 0)}
              color="text-green-600"
              icon={<PiggyBank className="w-6 h-6 text-green-500" />}
              sub={`${summary?.totalTransactions || 0} transaksi • ${summary?.itemsSold || 0} item`}
            />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Penjualan per Hari</h2>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}rb` : String(v))} />
                  <Tooltip formatter={(v: number) => [rupiah(v), 'Penjualan']} labelFormatter={(l) => shortDate(String(l))} />
                  <Bar dataKey="total_sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Detail Transaksi ({txs.length})</h2>
            </div>
            {txs.length === 0 ? (
              <p className="text-center py-12 text-gray-400">Tidak ada transaksi pada periode ini</p>
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
                        {new Date(t.date_time).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
        </>
      )}
    </div>
  );
};

export default AdminLaporanPage;
