import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, Loader2, DollarSign, PiggyBank, Percent } from 'lucide-react';

const API = 'http://localhost:3000';

type PeriodKey = '7' | '30' | 'custom';

interface Totals {
  revenue: number;
  grossProfit: number;
  cogs: number;
  margin: number;
}

interface ProdProfit {
  product_id: number;
  product_code: string;
  product_name: string;
  category: string | null;
  qty_sold: number;
  revenue: number;
  profit: number;
}

interface CatProfit {
  category: string;
  qty_sold: number;
  revenue: number;
  profit: number;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const AdminProfitPage: React.FC = () => {
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [totals, setTotals] = useState<Totals | null>(null);
  const [products, setProducts] = useState<ProdProfit[]>([]);
  const [categories, setCategories] = useState<CatProfit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const p: any = period === 'custom' && start && end ? { start, end } : { days: Number(period) };
      const qs = new URLSearchParams(p).toString();
      const res = await axios.get(`${API}/api/profit/by-product?${qs}&limit=20`);
      setTotals(res.data.totals);
      setProducts(res.data.products || []);
      setCategories(res.data.categories || []);
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

  const maxProfit = Math.max(1, ...products.map((p) => p.profit));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-green-600" /> Profit
        </h1>
        <p className="text-sm text-gray-500">Analisis profit per produk & kategori</p>
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { k: '7', label: '7 Hari' },
            { k: '30', label: '30 Hari' },
            { k: 'custom', label: 'Custom' },
          ].map((b) => (
            <button
              key={b.k}
              onClick={() => setPeriod(b.k as PeriodKey)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                period === b.k ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {b.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400">s/d</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Omset</p>
                  <p className="text-2xl font-bold text-blue-600">{rupiah(totals?.revenue || 0)}</p>
                </div>
                <DollarSign className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Gross Profit</p>
                  <p className="text-2xl font-bold text-green-600">{rupiah(totals?.grossProfit || 0)}</p>
                </div>
                <PiggyBank className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Margin</p>
                  <p className="text-2xl font-bold text-purple-600">{(totals?.margin || 0).toFixed(1)}%</p>
                  <p className="text-xs text-gray-400 mt-1">Modal: {rupiah(totals?.cogs || 0)}</p>
                </div>
                <Percent className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </div>

          {/* Top profitable products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Produk Paling Profitable</h2>
            {products.length === 0 ? (
              <p className="text-center py-8 text-gray-400">Belum ada data profit pada periode ini</p>
            ) : (
              <div className="space-y-4">
                {products.map((p) => (
                  <div key={p.product_id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-700">{p.product_name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{p.product_code}</span>
                        <span className="text-gray-400 ml-2 text-xs">• {p.qty_sold} terjual</span>
                      </div>
                      <span className="font-semibold text-green-600 shrink-0">{rupiah(p.profit)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${Math.max(2, (p.profit / maxProfit) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Breakdown per Kategori</h2>
            </div>
            {categories.length === 0 ? (
              <p className="text-center py-8 text-gray-400">Belum ada data kategori</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Terjual</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Omset</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {categories.map((c) => (
                    <tr key={c.category} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-800">{c.category}</td>
                      <td className="px-6 py-3 text-sm text-center text-gray-600">{c.qty_sold}</td>
                      <td className="px-6 py-3 text-sm text-right text-gray-700">{rupiah(c.revenue)}</td>
                      <td className="px-6 py-3 text-sm text-right font-semibold text-green-600">{rupiah(c.profit)}</td>
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

export default AdminProfitPage;
