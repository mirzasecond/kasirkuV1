import React from 'react';
import { ShoppingCart, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import tokoBg from '../assets/gambartoko.jpeg';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const handleKioskMode = () => {
    navigate('/kiosk');
  };

  const handleAdminMode = () => {
    navigate('/admin');
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${tokoBg})` }}
    >
      {/* Dark overlay so the white card stays readable over the photo */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Card (centered) */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-8 max-w-4xl w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">KasirKu</h1>
          </div>
          <p className="text-lg text-gray-600">Aplikasi POS untuk OMAH TACO</p>
        </div>

        {/* Mode Selection */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Kiosk Mode Card */}
          <button
            onClick={handleKioskMode}
            className="group relative bg-white border-2 border-blue-200 hover:border-blue-500 rounded-xl p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
          >
            <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShoppingCart className="w-24 h-24 text-blue-600" />
            </div>
            
            <div className="relative z-10">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
                <ShoppingCart className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Mode Kasir</h2>
              <p className="text-gray-600 mb-4">Antarmuka kasir yang simple dan cepat untuk transaksi harian</p>
              
              <div className="flex items-center text-blue-600 font-semibold group-hover:gap-2 transition-all">
                Mulai Transaksi →
              </div>
            </div>
          </button>

          {/* Admin Mode Card */}
          <button
            onClick={handleAdminMode}
            className="group relative bg-white border-2 border-blue-200 hover:border-blue-500 rounded-xl p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
          >
            <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <LayoutDashboard className="w-24 h-24 text-blue-600" />
            </div>
            
            <div className="relative z-10">
              <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
                <LayoutDashboard className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors" />
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Mode Admin</h2>
              <p className="text-gray-600 mb-4">Kelola produk, stok, laporan penjualan, dan pengaturan sistem</p>
              
              <div className="flex items-center text-blue-600 font-semibold group-hover:gap-2 transition-all">
                Buka Dashboard →
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500">© 2026 Mirza Razaq - KasirKu Point of Sale System v1.0</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
