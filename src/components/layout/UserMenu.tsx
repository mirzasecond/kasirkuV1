import React, { useEffect, useRef, useState } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  cashier: 'Kasir',
  developer: 'Developer',
};

const roleLabel = (role?: string) => {
  if (!role) return 'User';
  return ROLE_LABELS[role] || role.charAt(0).toUpperCase() + role.slice(1);
};

// Label role ringkas untuk baris kedua di topbar. Jika nama user sama dengan
// label role (mis. name="Administrator" & role="admin"), jangan tampilkan teks
// identik dua kali — gunakan label singkat dari key role.
const roleSubLabel = (name: string, role?: string) => {
  const full = roleLabel(role);
  if (full.toLowerCase() === (name || '').toLowerCase()) {
    if (role === 'admin') return 'Admin';
    if (role === 'cashier') return 'Kasir';
    if (role) return role.charAt(0).toUpperCase() + role.slice(1);
    return 'User';
  }
  return full;
};

interface UserMenuProps {
  /** 'topbar' = avatar on the right; 'sidebar' = profile block bottom-left */
  variant?: 'topbar' | 'sidebar';
}

/**
 * Shared avatar/profile dropdown. Clicking it opens a small menu with the
 * user's name, role, a divider and a Logout button. Clicking outside closes it.
 * Used identically by the TopBar (right) and Sidebar (bottom-left).
 */
export const UserMenu: React.FC<UserMenuProps> = ({ variant = 'topbar' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/admin-login');
  };

  const name = user?.name || 'Pengguna';
  const role = roleLabel(user?.role);
  const initial = (name || 'U').charAt(0).toUpperCase();

  // Shared dropdown panel (positioned upward for sidebar, downward for topbar)
  const panel = (
    <div
      className={`absolute right-0 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 ${
        variant === 'sidebar' ? 'bottom-full mb-2 left-0' : 'mt-2'
      }`}
    >
      <div className="px-4 py-2">
        <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
        <p className="text-xs text-gray-500 truncate">{role}</p>
      </div>
      <div className="border-t border-gray-100 my-1" />
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
      >
        <LogOut className="w-4 h-4" /> Logout
      </button>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <div className="relative" ref={ref}>
        {open && panel}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors text-left"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{name}</p>
            <p className="text-xs text-slate-400 truncate">{role}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    );
  }

  // topbar variant
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 pl-4 border-l border-gray-200 hover:opacity-80"
      >
        <div className="text-right hidden sm:block">
          <p className="font-semibold text-gray-800 text-sm">{name}</p>
          <p className="text-xs text-gray-500">{roleSubLabel(name, user?.role)}</p>
        </div>
        <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
          {initial}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && panel}
    </div>
  );
};

export default UserMenu;
