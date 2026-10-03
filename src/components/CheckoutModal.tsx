import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { KioskNotify } from './KioskNotification';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onCheckout: (paymentMethod: 'cash' | 'card' | 'qris', paymentAmount?: number) => void;
  /** true selama request checkout berjalan — mengunci tombol Konfirmasi. */
  submitting?: boolean;
  /** FIX FINDING-4: pengganti alert() — pesan non-blocking. */
  notify?: KioskNotify;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ 
  isOpen, 
  onClose, 
  total, 
  onCheckout,
  submitting = false,
  notify
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qris'>('cash');
  const [cashPaid, setCashPaid] = useState('');

  // FIX FINDING-4: beri tahu kasir SEKALI per rangkaian ketikan bahwa uang
  // kurang (tombol Konfirmasi tetap disabled — tidak ada checkout).
  const insufficientNotifiedRef = useRef(false);

  // Auto-fill cash amount with total when modal opens
  useEffect(() => {
    if (isOpen) {
      setCashPaid(total.toString());
      // Modal dibuka ulang → rangkaian peringatan dimulai dari awal.
      insufficientNotifiedRef.current = false;
    }
  }, [isOpen, total]);

  const handleCashChange = (value: string) => {
    setCashPaid(value);
    const insufficient = value !== '' && Number(value) < total;
    if (insufficient && !insufficientNotifiedRef.current) {
      insufficientNotifiedRef.current = true;
      notify?.('Uang pembayaran kurang', 'error');
    }
    if (!insufficient) insufficientNotifiedRef.current = false;
  };

  if (!isOpen) return null;

  const change = paymentMethod === 'cash' 
    ? Math.max(0, Number(cashPaid) - total) 
    : 0;
  // BUG 2 FIX: detect underpayment on the client before sending to the server.
  const isCashInsufficient =
    paymentMethod === 'cash' && cashPaid !== '' && Number(cashPaid) < total;

  const handleCheckout = () => {
    // KUNCI KLIK GANDA: selama request berjalan, klik berikutnya diabaikan
    // sehingga tidak pernah mengirim request checkout kedua.
    if (submitting) return;
    if (paymentMethod === 'cash' && !cashPaid) {
      notify?.('Masukkan jumlah uang bayar', 'warning');
      return;
    }
    // BUG 2 FIX: block checkout when the cash entered is less than the total.
    if (paymentMethod === 'cash' && Number(cashPaid) < total) {
      notify?.('Uang pembayaran kurang', 'error');
      return;
    }
    const actualAmount = paymentMethod === 'cash' ? Number(cashPaid) : undefined;
    onCheckout(paymentMethod, actualAmount);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Checkout</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-100 rounded-lg">
            <div className="flex justify-between font-bold text-lg">
              <span>Total Bayar:</span>
              <span>Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Metode Pembayaran:</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card' | 'qris')}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">Tunai</option>
              <option value="card">Kartu</option>
              <option value="qris">QRIS</option>
            </select>
          </div>

          {paymentMethod === 'cash' && (
            <div>
              <label className="block text-sm font-medium mb-2">Jumlah Uang Bayar:</label>
              <input
                type="number"
                value={cashPaid}
                onChange={(e) => handleCashChange(e.target.value)}
                placeholder="Masukkan jumlah uang..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {change > 0 && (
            <div className="p-3 bg-green-100 rounded-lg">
              <div className="flex justify-between">
                <span>Kembalian:</span>
                <span className="font-bold">Rp {change.toLocaleString('id-ID')}</span>
              </div>
            </div>
          )}

          {isCashInsufficient && (
            <div role="alert" className="p-3 bg-red-100 rounded-lg text-red-700">
              <div className="flex justify-between">
                <span>Uang kurang:</span>
                <span className="font-bold">
                  Rp {(total - Number(cashPaid)).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 font-semibold"
            >
              Batal
            </button>
            <button
              onClick={handleCheckout}
              disabled={submitting || (paymentMethod === 'cash' && (!cashPaid || isCashInsufficient))}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {submitting ? 'Memproses...' : 'Konfirmasi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;
