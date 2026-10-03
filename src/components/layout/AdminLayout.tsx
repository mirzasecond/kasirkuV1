import React from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate?: (pageId: string) => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ 
  children, 
  activePage,
  onNavigate
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const handleNavigate = (pageId: string) => {
    if (onNavigate) onNavigate(pageId);
    // Route admin pages under /admin/<pageId>. Dashboard = /admin.
    if (pageId === 'dashboard') navigate('/admin');
    else if (pageId === 'kiosk') navigate('/kiosk');
    else navigate(`/admin/${pageId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <Sidebar 
        activePage={activePage} 
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div 
        className={`
          flex flex-col min-h-screen transition-all duration-300
          ${sidebarOpen ? 'lg:ml-64' : 'ml-0 lg:ml-64'}
        `}
      >
        {/* Top Bar */}
        <TopBar 
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          username={user?.name || 'Administrator'}
          role={user?.role || ''}
        />

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;

