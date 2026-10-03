import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AdminLayout } from './layout/AdminLayout';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminLayout?: boolean;
  activePage?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  adminLayout = false,
  activePage = 'dashboard'
}) => {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin-login" replace />;
  }

  if (adminLayout) {
    // Derive the active sidebar item / permission key from the URL.
    const seg = location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
    const derived = seg && seg !== '' ? seg : 'dashboard';

    // Route-level guard: block direct URL access to menus the role lacks.
    if (!hasPermission(derived)) {
      return (
        <AdminLayout activePage={derived}>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShieldAlert className="w-16 h-16 text-red-400 mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-1">Akses Ditolak</h2>
            <p className="text-gray-500 text-sm">
              Role Anda tidak memiliki izin untuk membuka halaman <b>{derived}</b>.
            </p>
            <a href="/admin" className="mt-6 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Kembali ke Dashboard
            </a>
          </div>
        </AdminLayout>
      );
    }

    return (
      <AdminLayout activePage={derived}>
        {children}
      </AdminLayout>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
