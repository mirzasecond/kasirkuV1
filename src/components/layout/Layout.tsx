import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate?: (pageId: string) => void;
  title?: string;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activePage, 
  onNavigate = () => {},
  title
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <Sidebar 
        activePage={activePage} 
        onNavigate={onNavigate}
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
        />

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {title && (
            <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>
          )}
          
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
