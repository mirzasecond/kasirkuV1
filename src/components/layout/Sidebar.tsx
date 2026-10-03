import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { UserMenu } from './UserMenu';
import { 
  LayoutDashboard,
  ShoppingCart,
  Package,
  PlusCircle,
  CreditCard,
  Clock,
  BarChart3,
  TrendingUp,
  Percent,
  Calculator,
  MessageSquare,
  Users,
  Shield,
  FileSearch,
  Upload,
  Download,
  Settings,
  User,
  Menu,
  X
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  group?: string;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'kiosk', label: 'Kasir', icon: ShoppingCart },
  { id: 'products', label: 'Produk', icon: Package },
  { id: 'stock-in', label: 'Tambah Stok', icon: PlusCircle },
  { id: 'transactions', label: 'Transaksi', icon: CreditCard },
  { id: 'history', label: 'Riwayat', icon: Clock },
  { id: 'reports', label: 'Laporan', icon: BarChart3 },
  { id: 'profit', label: 'Profit', icon: TrendingUp },
  { id: 'discounts', label: 'Diskon & Promo', icon: Percent },
  { id: 'tax', label: 'Pajak', icon: Calculator },
  { id: 'telegram', label: 'Telegram', icon: MessageSquare },
  { id: 'users', label: 'User', icon: User },
  { id: 'roles', label: 'Role', icon: Shield },
  { id: 'audit', label: 'Audit Log', icon: FileSearch },
  { id: 'import', label: 'Import Excel', icon: Upload },
  { id: 'backup', label: 'Backup', icon: Download },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate, isOpen = true, onClose }) => {
  const { hasPermission } = useAuth();
  // Only show menus the logged-in user's role is allowed to access.
  const visibleItems = menuItems.filter((item) => hasPermission(item.id));
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
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" />
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
            {visibleItems.map((item) => {
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

        {/* User Profile Footer (dropdown: info + logout) */}
        <div className="p-4 border-t border-slate-700">
          <UserMenu variant="sidebar" />
        </div>
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
}

export default Sidebar;
