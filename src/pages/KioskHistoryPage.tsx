import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Calendar, Clock, History as HistoryIcon } from 'lucide-react';

interface Transaction {
  id: string;
  reference_no: string;
  date_time: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  payment_amount: number;
  change_amount: number;
  items: any[];
}

export const KioskHistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Auto-refresh every 5 seconds
  useEffect(() => {
    loadTransactions();
    
    const interval = setInterval(() => {
      if (!loading) {
        loadTransactions();
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [filterDate]);

  useEffect(() => {
    loadTransactions();
  }, [lastUpdate]);

  const loadTransactions = async () => {
    try {
      let url = 'http://localhost:3000/api/transactions?limit=50';
      if (filterDate) {
        url += `&date=${filterDate}`;
      }
      
      const response = await axios.get(url);
      const txs = response.data.transactions || [];
      setTransactions(txs);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <button 
          onClick={() => window.location.href = '/kiosk'}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          Back to Beranda
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Riwayat Transaksi</h1>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Filter by Date:
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setFilterDate('')}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
          >
            Reset
          </button>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {transactions.length} transaction(s)
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></span>
              <span>Last update: {new Date(lastUpdate).toLocaleTimeString()}</span>
              {!loading && <button onClick={() => setLastUpdate(Date.now())} className="hover:text-blue-600">Refresh</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                No. Transaksi
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tanggal & Waktu
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {tx.reference_no}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {formatDate(tx.date_time)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tx.items?.length || 0} item(s)
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 text-right">
                  {formatCurrency(tx.grand_total)}
                </td>
              </tr>
            ))}
            
            {transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <HistoryIcon className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Tidak ada riwayat transaksi</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KioskHistoryPage;
