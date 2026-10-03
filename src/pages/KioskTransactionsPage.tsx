import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ArrowLeft, Calendar, Clock, CreditCard } from 'lucide-react';

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

export const TransactionsPage: React.FC = () => {
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  // Guard to prevent overlapping polls (race condition): skip a tick if a
  // previous GET is still in flight, so an older response can't overwrite
  // a newer one.
  const isFetchingRef = useRef(false);

  // Auto-refresh every 5 seconds (same pattern as KioskHistoryPage.tsx).
  // The interval callback is silent: it never touches `loading`, so the UI
  // doesn't flash a full-page spinner on each refresh.
  useEffect(() => {
    loadPendingTransactions();

    const interval = setInterval(() => {
      loadPendingTransactions();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const loadPendingTransactions = async () => {
    // Skip if a request is already pending (avoid stacked/racing requests)
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      // BUG 1 FIX: send ?date=<today> so the backend returns ONLY today's
      // transactions. Without it the endpoint returned the N latest rows from
      // any day, while the header still said "Transaksi Hari Ini".
      // Today must be computed in LOCAL time (WIB), not UTC, otherwise the
      // day is wrong between 00:00 and 07:00 WIB. `sv-SE` yields YYYY-MM-DD.
      const today = new Date().toLocaleDateString('sv-SE');
      const response = await axios.get(`http://localhost:3000/api/transactions?date=${today}`);
      const txs = response.data.transactions || [];
      
      // Filter only recent ones (last 10) — already scoped to today by the API
      setPendingTransactions(txs.slice(0, 10));
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <h1 className="text-2xl font-bold text-gray-800">Transaksi</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">
          Transaksi Hari Ini ({pendingTransactions.length})
        </h2>

        {pendingTransactions.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Belum ada transaksi hari ini</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTransactions.map((tx) => (
              <div key={tx.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-gray-800">{tx.reference_no}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(tx.date_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {tx.items?.length || 0} items
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">
                      Rp {(tx.grand_total / 1000).toFixed(0)}K
                    </div>
                    <div className="text-xs text-green-600">Selesai</div>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-600">Pembayaran:</span>
                  <span className="font-medium">Rp {(tx.payment_amount / 1000).toFixed(0)}K</span>
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-600">Kembalian:</span>
                  <span className="font-medium text-green-600">Rp {(tx.change_amount / 1000).toFixed(0)}K</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
