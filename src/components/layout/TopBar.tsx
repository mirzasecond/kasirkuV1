import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Menu, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { UserMenu } from './UserMenu';

const API = 'http://localhost:3000';

interface LowStockItem {
  id: number;
  code: string;
  description: string;
  stock: number;
  minimum_stock: number;
  unit: string;
}

interface TopBarProps {
  onMenuClick?: () => void;
  username?: string;
  role?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');

  // Notification bell = ringkasan stok dari GET /api/dashboard/low-stock
  // (endpoint existing). Ini BUKAN notification center & tidak menyentuh
  // arsitektur Telegram (notifications_queue).
  const [bellOpen, setBellOpen] = useState(false);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockError, setLowStockError] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Update waktu setiap detik
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchLowStock = async () => {
    setLowStockLoading(true);
    setLowStockError(false);
    try {
      const res = await axios.get(`${API}/api/dashboard/low-stock`);
      setLowStock(res.data.products || []);
    } catch (e) {
      console.error('Gagal memuat notifikasi stok:', e);
      setLowStockError(true);
      setLowStock([]);
    } finally {
      setLowStockLoading(false);
    }
  };

  // Ambil data saat mount (tanpa polling).
  useEffect(() => {
    fetchLowStock();
  }, []);

  // Tutup popover saat klik di luar / ESC (pattern sama dengan UserMenu).
  useEffect(() => {
    if (!bellOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setBellOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [bellOpen]);

  const toggleBell = () => {
    setBellOpen((v) => {
      const next = !v;
      if (next) fetchLowStock(); // refresh saat dibuka
      return next;
    });
  };

  // Format ringkas: "Rabu, 30 September 2026 • 19:32" (tanpa detik).
  const formatDateTime = (date: Date) => {
    const tanggal = date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const jam = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${tanggal} • ${jam}`;
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between gap-4">
        {/* Mobile Menu Button */}
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-6 h-6 text-gray-700" />
        </button>

        {/* Search Bar */}
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Cari produk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          {/* Notification Bell (stok menipis/habis) */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={toggleBell}
              aria-label="Notifikasi stok"
              aria-haspopup="dialog"
              aria-expanded={bellOpen}
              title="Notifikasi stok"
              className="relative p-2 hover:bg-gray-100 rounded-lg group"
            >
              <Bell className="w-6 h-6 text-gray-600 group-hover:text-gray-900" />
              {lowStock.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {bellOpen && (
              <div
                role="dialog"
                aria-label="Notifikasi stok"
                className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">Notifikasi Stok</p>
                  {lowStock.length > 0 && (
                    <span className="text-xs font-medium text-gray-500">{lowStock.length} produk</span>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {lowStockLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
                    </div>
                  ) : lowStockError ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">Gagal memuat notifikasi stok.</p>
                  ) : lowStock.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                      <CheckCircle2 className="w-6 h-6 text-green-500 mb-2" />
                      <p className="text-sm text-gray-600">Semua stok dalam kondisi aman.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {lowStock.slice(0, 5).map((p) => {
                        const habis = Number(p.stock) <= 0;
                        return (
                          <li key={p.id} className="px-4 py-2.5 flex items-start gap-3">
                            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${habis ? 'text-red-500' : 'text-amber-500'}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-[11px] font-semibold ${habis ? 'text-red-600' : 'text-amber-600'}`}>
                                {habis ? 'STOK HABIS' : 'STOK MENIPIS'}
                              </p>
                              <p className="text-sm font-medium text-gray-800 truncate" title={p.description}>{p.description}</p>
                              <p className="text-xs text-gray-400">{p.code}</p>
                              <p className="text-xs text-gray-600 mt-0.5">{p.stock} {p.unit}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {!lowStockError && !lowStockLoading && lowStock.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBellOpen(false);
                      navigate('/admin/products');
                    }}
                    className="block w-full px-4 py-2.5 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                  >
                    {lowStock.length > 5 ? `Lihat semua stok (${lowStock.length})` : 'Lihat stok di Produk'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Date & Time */}
          <div className="hidden md:flex flex-col items-end text-sm">
            <p className="font-semibold text-gray-800">{formatDateTime(currentTime)}</p>
          </div>

          {/* User Info (avatar dropdown) */}
          <UserMenu variant="topbar" />
        </div>
      </div>
    </header>
  );
}

export default TopBar;
