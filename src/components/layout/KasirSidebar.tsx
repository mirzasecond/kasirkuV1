import React from 'react';
import { 
  Home,
  CreditCard,
  History,
  Settings,
  X
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
}

const menuItems: MenuItem[] = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'transaksi', label: 'Transaksi', icon: CreditCard },
  { id: 'riwayat', label: 'Riwayat', icon: History },
  { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
];

interface KasirSidebarProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const KasirSidebar: React.FC<KasirSidebarProps> = ({ 
  activePage, 
  onNavigate, 
  isOpen = true,
  onClose 
}) => {
  return (
    <>
      {/* Mobile overlay */}
      {!isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside 
        className={`
          fixed top-0 left-0 h-full bg-slate-900 text-white w-64 shadow-xl
          transition-transform duration-300 ease-in-out z-50
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Logo/Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              <span>KasirKu</span>
            </h1>
            <button 
              onClick={onClose}
              className="lg:hidden p-1 hover:bg-slate-700 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => {
              const isActive = activePage === item.id;
              const Icon = item.icon;

              return (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                      transition-all duration-200
                      ${isActive 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Backdrop for mobile when sidebar is open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};

export default KasirSidebar;
