import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import KasirSidebar from './KasirSidebar';
import { CreditCard, Menu, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const paths: Record<string, string> = {
  beranda: '/kiosk',
  transaksi: '/kiosk/transaksi',
  riwayat: '/kiosk/riwayat',
  pengaturan: '/kiosk/pengaturan',
};

function KasirLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const activePage = Object.entries(paths).find(([, path]) => path === location.pathname)?.[0] || 'beranda';

  // Kiosk requires a logged-in cashier: transactions record who sold, so an
  // anonymous session must never reach the POS screen.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Memuat...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/kiosk/login" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/kiosk/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <KasirSidebar 
        activePage={activePage}
        onNavigate={(pageId) => {
          navigate(paths[pageId]);
          if (window.innerWidth < 1024) setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div 
        className={`
          flex-1 transition-all duration-300
          ${sidebarOpen ? 'lg:ml-64' : 'ml-0 lg:ml-64'}
        `}
      >
        {/* Top Bar - Same as before but integrated with layout */}
        <header className="bg-slate-900 text-white shadow-lg px-4 py-3 lg:px-6 flex items-center justify-between mb-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-slate-700 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="w-7 h-7 text-blue-400" />
                <span>KasirKu POS</span>
              </h1>
              <p className="text-xs text-slate-300">Point of Sale System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">
                {new Date().toLocaleDateString('id-ID', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            
            <div className="flex items-center gap-3 pl-4 border-l border-slate-600">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold">{user?.name || user?.username || '-'}</p>
                <p className="text-xs text-slate-400">{user?.role || 'kasir'}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="text-red-400 hover:text-red-300 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default KasirLayout;
