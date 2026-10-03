import React, { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { KioskNotify } from './KioskNotification';

interface ReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  total: number;
  cart: any[];
  discount: number;
  paymentMethod?: 'cash' | 'card' | 'qris';
  paymentAmount?: number;
  cashierName?: string;
  /** FIX FINDING-4: pengganti alert() — pesan non-blocking. */
  notify?: KioskNotify;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ 
  isOpen, 
  onClose, 
  transaction, 
  total, 
  cart, 
  discount,
  paymentMethod = 'cash',
  paymentAmount = total,
  cashierName = 'Unknown',
  notify
}) => {
  const [showReceipt, setShowReceipt] = useState(false);
  // Store profile from settings (so the receipt reflects Pengaturan, not a
  // hardcoded name). Falls back to 'KASIRKU' if not configured.
  const [store, setStore] = useState<{ name: string; address: string; phone: string; footer: string; logo: string }>({
    name: 'KASIRKU', address: '', phone: '', footer: 'Terima kasih atas kunjungan Anda!', logo: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    fetch('http://localhost:3000/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setStore({
          name: s.store_name || 'KASIRKU',
          address: s.store_address || '',
          phone: s.store_phone || '',
          footer: s.receipt_footer || 'Terima kasih atas kunjungan Anda!',
          logo: s.store_logo || '',
        });
      })
      .catch(() => { /* keep defaults */ });
  }, [isOpen]);
  
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setShowReceipt(true), 10);
    } else {
      setShowReceipt(false);
    }
  }, [isOpen]);

  // DEBUG: Check data being passed to receipt
  useEffect(() => {
    console.log('=== RECEIPT PREVIEW COMPONENT ===');
    console.log('Transaction received:', transaction);
    console.log('Cashier Name prop:', cashierName);
    console.log('Using cashier name for display:', cashierName || transaction?.cashier_name || 'Unknown');
  }, [isOpen, transaction, cashierName]);

  const printReceipt = () => {
    // Create a temporary window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow && printWindow.document) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Struk KasirKu</title>
          <style>
            @page { 
              size: auto;
              margin: 10mm;
            }
            
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10pt;
              line-height: 1.4;
              margin: 0;
              padding: 10mm;
              min-width: 100%;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }
            
            .receipt-wrapper {
              width: 80mm;
              padding: 5mm;
              background: white;
            }
            
            .receipt-header {
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 3mm;
              margin-bottom: 3mm;
            }
            
            .receipt-header h1 {
              margin: 0;
              font-size: 14pt;
              font-weight: bold;
            }
            
            .receipt-header .date {
              margin: 2mm 0;
              font-size: 9pt;
            }
            
            .receipt-info {
              margin-bottom: 4mm;
              border-bottom: 1px solid #000;
              padding-bottom: 2mm;
            }
            
            .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1mm;
            }
            
            .info-label {
              font-size: 9pt;
            }
            
            .info-value {
              font-size: 9pt;
              font-weight: bold;
            }
            
            .items-container {
              margin-bottom: 4mm;
              border-bottom: 1px solid #000;
              padding-bottom: 2mm;
            }
            
            .item-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 1mm 0;
              border-bottom: 1px dashed #ccc;
            }
            
            .item-name {
              font-size: 9pt;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 60mm;
            }
            
            .item-price {
              font-size: 9pt;
              font-weight: bold;
            }
            
            .totals-container {
              margin-bottom: 4mm;
              border-bottom: 1px solid #000;
              padding-bottom: 2mm;
            }
            
            .total-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1mm;
              padding: 0.5mm 0;
            }
            
            .total-row.bold {
              font-weight: bold;
              font-size: 11pt;
              margin-top: 2mm;
              padding-top: 2mm;
              border-top: 1px solid #000;
            }
            
            .payment-section {
              margin-bottom: 3mm;
              border-bottom: 1px solid #000;
              padding-bottom: 2mm;
            }
            
            .payment-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1mm;
            }
            
            .payment-change {
              font-size: 10pt;
              font-weight: bold;
            }
            
            .receipt-footer {
              text-align: center;
              margin-top: 3mm;
              font-size: 9pt;
              border-top: 1px solid #000;
              padding-top: 3mm;
            }
            
            @media print {
              body {
                padding: 10mm;
              }
              
              .receipt-wrapper {
                box-shadow: none;
                width: 80mm;
                margin: 0 auto;
              }
              
              .receipt-header,
              .receipt-info,
              .items-container,
              .totals-container,
              .payment-section {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">
          <div class="receipt-header">
            ${store.logo ? `<img src="${store.logo}" alt="logo" style="max-height:60px;margin:0 auto 6px;display:block;" />` : ''}
            <h1>${store.name.toUpperCase()}</h1>
            ${store.address ? `<div class="date">${store.address}</div>` : ''}
            ${store.phone ? `<div class="date">Telp: ${store.phone}</div>` : ''}
            <div class="date">${receiptDate}</div>
          </div>
          
          <div class="receipt-info">
            <div class="info-row">
              <span class="info-label">No. Transaksi:</span>
              <span class="info-value">${transaction?.reference_no || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Kasir:</span>
              <span class="info-value">${cashierName}</span>
            </div>
          </div>
          
          <div class="items-container">
            ${cart.map(item => `
              <div class="item-row">
                <span class="item-name">${item.description.substring(0, 18).padEnd(18)} x${item.quantity}</span>
                <span class="item-price">${formatCurrency(item.selling_price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
          
          <div class="totals-container">
            <div class="total-row">
              <span class="info-label">Subtotal:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            ${receiptDiscount > 0 ? `<div class="total-row"><span class="info-label">Diskon:</span><span>-${formatCurrency(receiptDiscount)}</span></div>` : ''}
            <div class="total-row">
              <span class="info-label">Pajak:</span>
              <span>${formatCurrency(tax)}</span>
            </div>
            <div class="total-row bold">
              <span>TOTAL:</span>
              <span>Rp ${grandTotal.toLocaleString('id-ID')}</span>
            </div>
          </div>
          
          <div class="payment-section">
            <div class="payment-row">
              <span class="info-label">Metode:</span>
              <span class="info-value">
                ${paymentMethod === 'cash' ? 'Tunai' : paymentMethod === 'card' ? 'Kartu' : 'QRIS'}
              </span>
            </div>
            ${paymentMethod === 'cash' ? `
              <div class="payment-row">
                <span class="info-label">Bayar:</span>
                <span>Rp ${Number(paymentAmount).toLocaleString('id-ID')}</span>
              </div>
              <div class="payment-row">
                <span class="info-label">Kembalian:</span>
                <span class="payment-change">Rp ${change.toLocaleString('id-ID')}</span>
              </div>
            ` : ''}
            </div>
            
            <div class="receipt-footer">
              ${store.footer}
            </div>
          </div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 250);
    } else {
      console.error('Failed to open print window - popup blocked');
      notify?.('Popup diblokir browser sehingga dialog cetak tidak muncul. Izinkan popup untuk situs ini lalu coba cetak lagi.', 'warning');
    }
  };

  const receiptDate = transaction?.created_at || transaction?.date_time
    ? new Date(transaction.created_at || transaction.date_time).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : new Date().toLocaleString('id-ID');

  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  // Prefer the discount ACTUALLY stored on the transaction (source of truth).
  const receiptDiscount = transaction?.discount_amount != null
    ? Number(transaction.discount_amount)
    : discount;
  const taxableAmount = Math.max(0, subtotal - receiptDiscount);
  // Use the tax ACTUALLY stored on the transaction (source of truth from the
  // backend TaxService). The fallback is only a last-resort display when the
  // field is completely absent; the real flow always has transaction.tax_amount.
  const tax = transaction?.tax_amount != null
    ? Number(transaction.tax_amount)
    : Math.floor(taxableAmount * 0.11);
  // Grand total shown on the receipt must equal what was stored in the DB.
  const grandTotal = transaction?.grand_total != null
    ? Number(transaction.grand_total)
    : total;
  const change = paymentMethod === 'cash' 
    ? Math.max(0, Number(paymentAmount) - grandTotal) 
    : 0;

  if (!isOpen || !showReceipt) return null;

  const formatCurrency = (amount: number) => {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:bg-transparent receipt-modal">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 relative shadow-lg print:shadow-none 
print:max-w-none receipt-modal-content">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 print:hidden"
        >
          <X size={24} />
        </button>

        <h2 className="text-xl font-bold mb-4 text-center print:hidden">Preview Struk</h2>
        
        <div className="bg-gray-100 p-6 rounded-lg font-mono text-sm space-y-1 print:bg-white print:p-0 print:rounded-none">
          {/* Header */}
          {store.logo && <img src={store.logo} alt="logo" className="h-12 mx-auto object-contain" />}
          <div className="text-center font-bold text-lg border-b pb-2">{store.name.toUpperCase()}</div>
          <div className="text-center text-xs border-b pb-2">
            {store.address && <div>{store.address}</div>}
            {store.phone && <div>Telp: {store.phone}</div>}
            {receiptDate}
          </div>
          
          {/* Transaction Info */}
          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span>No. Transaksi:</span>
              <span className="font-semibold">{transaction?.reference_no || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Kasir:</span>
              <span className="font-semibold">{cashierName}</span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t pt-2 mt-2 space-y-1">
            {cart.map((item, index) => (
              <div key={index} className="flex justify-between py-1">
                <span className="text-xs">
                  {item.description.substring(0, 18)} x{item.quantity}
                </span>
                <span>{formatCurrency(item.selling_price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Totals with breakdown */}
          <div className="border-t pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            
            {receiptDiscount > 0 && (
              <div className="flex justify-between text-xs">
                <span>Diskon:</span>
                <span>-{formatCurrency(receiptDiscount)}</span>
              </div>
            )}
            
            <div className="flex justify-between text-xs">
              <span>Pajak:</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            
            <div className="flex justify-between text-base font-bold mt-2 pt-2 border-t">
              <span>Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Payment Info */}
          <div className="border-t pt-2 mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Metode:</span>
              <span className="font-semibold">
                {paymentMethod === 'cash' && 'Tunai'}
                {paymentMethod === 'card' && 'Kartu'}
                {paymentMethod === 'qris' && 'QRIS'}
              </span>
            </div>
            
            {paymentMethod === 'cash' && (
              <>
                <div className="flex justify-between text-xs">
                  <span>Bayar:</span>
                  <span>{formatCurrency(Number(paymentAmount))}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span>Kembalian:</span>
                  <span>{formatCurrency(change)}</span>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t text-center text-xs">
            {store.footer}
          </div>
        </div>

        {/* Buttons (hidden in print) */}
        <div className="flex gap-3 mt-6 print:hidden">
          <button
            onClick={printReceipt}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2"
          >
            <Printer size={20} /> Cetak Struk
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
