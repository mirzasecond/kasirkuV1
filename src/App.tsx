import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import KioskPage from './pages/KioskPage';
import KioskLoginPage from './pages/KioskLoginPage';
import KioskTransactionsPage from './pages/KioskTransactionsPage';
import KioskHistoryPage from './pages/KioskHistoryPage';
import KioskSettingsPage from './pages/KioskSettingsPage';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import StockInPage from './pages/StockInPage';
import AdminTransaksiPage from './pages/AdminTransaksiPage';
import AdminRiwayatPage from './pages/AdminRiwayatPage';
import AdminLaporanPage from './pages/AdminLaporanPage';
import AdminProfitPage from './pages/AdminProfitPage';
import AdminPajakPage from './pages/AdminPajakPage';
import AdminBackupPage from './pages/AdminBackupPage';
import AdminDiskonPage from './pages/AdminDiskonPage';
import AdminTelegramPage from './pages/AdminTelegramPage';
import AdminImportPage from './pages/AdminImportPage';
import AdminRolePage from './pages/AdminRolePage';
import AdminUserPage from './pages/AdminUserPage';
import AdminAuditPage from './pages/AdminAuditPage';
import AdminPengaturanPage from './pages/AdminPengaturanPage';
import DeveloperPage from './pages/DeveloperPage';
import KasirLayout from './components/layout/KasirLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Home - Mode Selection */}
          <Route path="/" element={<LoginPage />} />
          
          {/* Admin Login Page */}
          <Route path="/admin-login" element={<AdminLoginPage />} />
          
          <Route path="/kiosk/login" element={<KioskLoginPage />} />
          <Route path="/kiosk" element={<KasirLayout />}>
            <Route index element={<KioskPage />} />
            <Route path="transaksi" element={<KioskTransactionsPage />} />
            <Route path="riwayat" element={<KioskHistoryPage />} />
            <Route path="pengaturan" element={<KioskSettingsPage />} />
          </Route>
          
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute adminLayout activePage="dashboard">
                <Routes>
                  <Route index element={<DashboardPage />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="products" element={<AdminPage />} />
                  <Route path="stock-in" element={<StockInPage />} />
                  <Route path="transactions" element={<AdminTransaksiPage />} />
                  <Route path="history" element={<AdminRiwayatPage />} />
                  <Route path="reports" element={<AdminLaporanPage />} />
                  <Route path="profit" element={<AdminProfitPage />} />
                  <Route path="tax" element={<AdminPajakPage />} />
                  <Route path="backup" element={<AdminBackupPage />} />
                  <Route path="discounts" element={<AdminDiskonPage />} />
                  <Route path="telegram" element={<AdminTelegramPage />} />
                  <Route path="import" element={<AdminImportPage />} />
                  <Route path="roles" element={<AdminRolePage />} />
                  <Route path="users" element={<AdminUserPage />} />
                  <Route path="audit" element={<AdminAuditPage />} />
                  <Route path="settings" element={<AdminPengaturanPage />} />
                  <Route path="*" element={<DashboardPage />} />
                </Routes>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/developer/*"
            element={
              <ProtectedRoute adminLayout activePage="backup">
                <DeveloperPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
