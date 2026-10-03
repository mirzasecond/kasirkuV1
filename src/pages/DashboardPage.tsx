import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  PiggyBank,
  Flame,
  AlertTriangle,
  Receipt,
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

interface DayMetrics {
  date: string;
  revenue: number;
  totalTransactions: number;
  itemsSold: number;
  grossProfit: number;
}

interface Summary {
  today: DayMetrics;
  yesterday: DayMetrics;
  change: {
    revenue: number | null;
    totalTransactions: number | null;
    itemsSold: number | null;
    grossProfit: number | null;
  };
}

interface ChartPoint {
  date: string;
  total_sales: number;
  total_profit: number;
}

interface TopProduct {
  product_id: number;
  product_code: string;
  product_name: string;
  qty_sold: number;
  revenue: number;
}

interface LowStockProduct {
  id: number;
  code: string;
  description: string;
  stock: number;
  minimum_stock: number;
  unit: string;
}

interface RecentTx {
  id: string;
  reference_no: string;
  date_time: string;
  grand_total: number;
  cashier_name?: string;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
};

const ChangeBadge: React.FC<{ value: number | null; todayZero: boolean }> = ({ value, todayZero }) => {
  // Tidak ada transaksi hari ini -> jangan tampilkan "+0.0% vs kemarin" (0 vs 0
  // bukan kenaikan yang bermakna). Tampilkan status netral.
  if (todayZero) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">Belum ada transaksi hari ini</span>;
  }
  // value = percentage change vs yesterday; null = no baseline (yesterday = 0)
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
        — data kemarin kosong
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}
      {value.toFixed(1)}%
      <span className="text-gray-400 font-normal">vs kemarin</span>
    </span>
  );
};

const SummaryCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  change: number | null;
  todayZero: boolean;
}> = ({ title, value, icon, iconBg, change, todayZero }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1 tabular-nums truncate">{value}</p>
      </div>
      <div className={`w-11 h-11 shrink-0 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
    <div className="mt-3 min-h-[20px]">
      <ChangeBadge value={change} todayZero={todayZero} />
    </div>
  </div>
);

// Empty state area grafik: di tengah area, terlihat sebagai kondisi normal.
const ChartEmpty: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="flex flex-col items-center justify-center text-center" style={{ width: '100%', height: 260 }}>
    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
      <Package className="w-6 h-6 text-gray-300" />
    </div>
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
  </div>
);

const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topDays, setTopDays] = useState<number>(7);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [recent, setRecent] = useState<RecentTx[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [s, c, t, l, r] = await Promise.all([
        axios.get(`${API}/api/dashboard/summary`),
        axios.get(`${API}/api/dashboard/chart?days=7`),
        axios.get(`${API}/api/dashboard/top-products?days=${topDays}&limit=5`),
        axios.get(`${API}/api/dashboard/low-stock`),
        axios.get(`${API}/api/transactions?limit=5`),
      ]);
      setSummary(s.data);
      setChart(c.data.data || []);
      setTopProducts(t.data.products || []);
      setLowStock(l.data.products || []);
      setRecent(r.data.transactions || []);
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDays]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Memuat dashboard...
      </div>
    );
  }

  const t = summary?.today;
  const ch = summary?.change;
  const todayZero = (t?.totalTransactions ?? 0) === 0;
  const hasChartData = chart.some((p) => (p.total_sales || 0) > 0 || (p.total_profit || 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Ringkasan penjualan {t ? new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
        </p>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          title="Omset Hari Ini"
          value={rupiah(t?.revenue || 0)}
          icon={<DollarSign className="w-6 h-6 text-blue-600" />}
          iconBg="bg-blue-50"
          change={ch?.revenue ?? null}
          todayZero={todayZero}
        />
        <SummaryCard
          title="Total Transaksi"
          value={String(t?.totalTransactions || 0)}
          icon={<Receipt className="w-6 h-6 text-indigo-600" />}
          iconBg="bg-indigo-50"
          change={ch?.totalTransactions ?? null}
          todayZero={todayZero}
        />
        <SummaryCard
          title="Barang Terjual"
          value={String(t?.itemsSold || 0)}
          icon={<Package className="w-6 h-6 text-amber-600" />}
          iconBg="bg-amber-50"
          change={ch?.itemsSold ?? null}
          todayZero={todayZero}
        />
        <SummaryCard
          title="Gross Profit"
          value={rupiah(t?.grossProfit || 0)}
          icon={<PiggyBank className="w-6 h-6 text-green-600" />}
          iconBg="bg-green-50"
          change={ch?.grossProfit ?? null}
          todayZero={todayZero}
        />
      </div>

      {/* 2 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Penjualan 7 Hari Terakhir</h2>
          {!hasChartData ? (
            <ChartEmpty title="Belum ada data penjualan" subtitle="Data akan muncul setelah transaksi dilakukan." />
          ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} stroke="#94a3b8" />
                <YAxis
                  fontSize={12}
                  stroke="#94a3b8"
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}rb` : String(v))}
                />
                <Tooltip
                  formatter={(v: number) => [rupiah(v), 'Penjualan']}
                  labelFormatter={(l) => shortDate(String(l))}
                />
                <Bar dataKey="total_sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Profit 7 Hari Terakhir</h2>
          {!hasChartData ? (
            <ChartEmpty title="Belum ada data profit" subtitle="Data akan muncul setelah transaksi dilakukan." />
          ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} stroke="#94a3b8" />
                <YAxis
                  fontSize={12}
                  stroke="#94a3b8"
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}rb` : String(v))}
                />
                <Tooltip
                  formatter={(v: number) => [rupiah(v), 'Profit']}
                  labelFormatter={(l) => shortDate(String(l))}
                />
                <Bar dataKey="total_profit" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </div>

      {/* 3 Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Produk Terlaris
            </h2>
            <select
              value={topDays}
              onChange={(e) => setTopDays(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600"
            >
              <option value={7}>7 hari</option>
              <option value={30}>30 hari</option>
            </select>
          </div>
          {topProducts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm font-medium text-gray-500">Belum ada data penjualan</p>
              <p className="text-xs text-gray-400 mt-1">Mulai transaksi untuk melihat produk terlaris.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{p.product_name}</p>
                    <p className="text-xs text-gray-400">{p.product_code}</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">{p.qty_sold} pcs</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Stok Menipis
          </h2>
          {lowStock.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Semua stok aman</p>
          ) : (
            <ul className="space-y-3">
              {lowStock.map((p) => {
                const habis = Number(p.stock) <= 0;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.description}</p>
                      <p className="text-xs text-gray-400">{p.code}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-semibold tabular-nums ${habis ? 'text-red-600' : 'text-amber-600'}`}>
                        {p.stock} {p.unit}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${
                        habis
                          ? 'bg-red-50 text-red-600 ring-red-200'
                          : 'bg-amber-50 text-amber-700 ring-amber-200'
                      }`}>
                        {habis ? 'HABIS' : 'MENIPIS'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent transactions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <ShoppingCart className="w-4 h-4 text-indigo-500" /> Transaksi Terakhir
          </h2>
          {recent.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm font-medium text-gray-500">Belum ada transaksi</p>
              <p className="text-xs text-gray-400 mt-1">Transaksi yang berhasil akan muncul di sini.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{tx.reference_no}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.date_time).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{rupiah(tx.grand_total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
