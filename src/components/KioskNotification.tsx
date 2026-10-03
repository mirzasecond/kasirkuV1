import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type KioskNotifyType = 'success' | 'error' | 'warning' | 'info';

export interface KioskNotificationItem {
  id: string;
  type: KioskNotifyType;
  message: string;
}

export type KioskNotify = (message: string, type?: KioskNotifyType) => void;

// Auto-dismiss. Pesan checkout/error sengaja lebih lama supaya kasir sempat
// membacanya; semua pesan tetap bisa ditutup manual lewat tombol X.
const AUTO_DISMISS_MS: Record<KioskNotifyType, number> = {
  success: 4000,
  info: 5000,
  warning: 8000,
  error: 10000,
};

interface Style {
  box: string;
  label: string;
  role: 'alert' | 'status';
  Icon: LucideIcon;
}

// Warna mengikuti gaya yang sudah dipakai aplikasi (mis. kotak merah/hijau di
// CheckoutModal): latar terang + teks gelap agar kontras tetap tinggi.
const STYLES: Record<KioskNotifyType, Style> = {
  error: { box: 'bg-red-50 border-red-500 text-red-800', label: 'Gagal', role: 'alert', Icon: XCircle },
  warning: { box: 'bg-amber-50 border-amber-500 text-amber-900', label: 'Perhatian', role: 'alert', Icon: AlertTriangle },
  success: { box: 'bg-green-50 border-green-600 text-green-800', label: 'Berhasil', role: 'status', Icon: CheckCircle2 },
  info: { box: 'bg-blue-50 border-blue-500 text-blue-800', label: 'Info', role: 'status', Icon: Info },
};

interface CardProps {
  item: KioskNotificationItem;
  onDismiss: (id: string) => void;
}

const NotificationCard: React.FC<CardProps> = ({ item, onDismiss }) => {
  const { box, label, role, Icon } = STYLES[item.type];

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[item.type];
    const timer = window.setTimeout(() => onDismiss(item.id), ms);
    return () => window.clearTimeout(timer);
  }, [item.id, item.type, onDismiss]);

  return (
    <div
      role={role}
      className={`pointer-events-none w-full max-w-xl border-l-4 rounded-md shadow-lg px-3 py-2.5 flex items-start gap-2.5 ${box}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
        <div className="text-sm font-medium break-words">{item.message}</div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={`Tutup pesan ${label}`}
        className="pointer-events-auto shrink-0 rounded p-1 hover:bg-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X size={16} />
      </button>
    </div>
  );
};

interface KioskNotificationProps {
  notifications: KioskNotificationItem[];
  onDismiss: (id: string) => void;
}

const KioskNotification: React.FC<KioskNotificationProps> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) return null;
  return (
    <div
      id="kiosk-notifications"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-4"
    >
      {notifications.map((item) => (
        <NotificationCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default KioskNotification;
