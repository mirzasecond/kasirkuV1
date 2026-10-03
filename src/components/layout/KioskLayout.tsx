import React from 'react';
import { ShoppingCart, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface KioskLayoutProps {
  children: React.ReactNode;
  onBackToLogin?: () => void;
}

export const KioskLayout: React.FC<KioskLayoutProps> = ({ 
  children,
  onBackToLogin = () => {}
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToLogin}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-8 h-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">KasirKu POS</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold text-gray-800">Administrator</p>
            <p className="text-xs text-gray-500">Kasir Mode</p>
          </div>
          <button
            onClick={onBackToLogin}
            className="text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default KioskLayout;
