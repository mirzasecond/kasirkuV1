import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Send,
  MessageSquare,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  Wifi,
  WifiOff,
  Trash2,
  RefreshCw,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface Notif {
  id: number;
  message: string;
  priority: number;
  status: string;
  retry_count: number;
  last_attempt: string | null;
  created_at: string;
}

const statusColor = (s: string) => {
  if (s === 'sent') return 'bg-green-100 text-green-700';
  if (s === 'pending') return 'bg-yellow-100 text-yellow-700';
  if (s === 'failed') return 'bg-red-100 text-red-700';
  if (s === 'max_retries_exceeded') return 'bg-red-200 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const AdminTelegramPage: React.FC = () => {
  const [cfg, setCfg] = useState<{ bot_token_masked: string; chat_id: string; configured: boolean; pending: number; failed: number } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string; bot_username?: string; chat_title?: string } | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // editable fields
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    try {
      const [c, n] = await Promise.all([
        axios.get(`${API}/api/telegram/config`),
        axios.get(`${API}/api/telegram/notifications?limit=100`),
      ]);
      setCfg(c.data);
      setChatId(c.data.chat_id || '');
      setNotifs(n.data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await axios.get(`${API}/api/telegram/status`);
      setStatus(res.data);
    } catch (e: any) {
      setStatus({ ok: false, message: e.response?.data?.message || 'Gagal cek koneksi' });
    } finally {
      setTesting(false);
    }
  };

  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      const res = await axios.post(`${API}/api/telegram/test-notification`);
      notify(res.data.message || 'Pesan test terkirim', 'success');
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal mengirim pesan test', 'error');
    } finally {
      setSendingTest(false);
      // Refresh history so the new test message appears immediately.
      try {
        const n = await axios.get(`${API}/api/telegram/notifications?limit=100`);
        setNotifs(n.data.notifications || []);
        const c = await axios.get(`${API}/api/telegram/config`);
        setCfg(c.data);
      } catch { /* ignore refresh errors */ }
    }
  };

  const saveConfig = async () => {
    if (!botToken && !cfg?.configured) return notify('Masukkan bot token', 'error');
    try {
      await axios.put(`${API}/api/telegram/config`, { bot_token: botToken || undefined, chat_id: chatId });
      notify('Konfigurasi disimpan', 'success');
      setBotToken('');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan', 'error');
    }
  };

  const clearProcessed = async () => {
    if (!confirm('Hapus semua notifikasi yang sudah diproses (sent/failed)?')) return;
    try {
      const res = await axios.delete(`${API}/api/telegram/notifications/processed`);
      notify(res.data.message || 'Dibersihkan', 'success');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal membersihkan', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-600" /> Telegram
          </h1>
          <p className="text-sm text-gray-500">Status koneksi & riwayat notifikasi</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            {status?.ok ? <Wifi className="w-6 h-6 text-green-600" /> : <WifiOff className="w-6 h-6 text-gray-400" />}
            <div>
              <p className="text-sm text-gray-500">Status Koneksi</p>
              <p className={`font-bold ${status?.ok ? 'text-green-600' : 'text-gray-600'}`}>
                {status ? (status.ok ? 'Terhubung' : 'Tidak terhubung') : 'Belum dicek'}
              </p>
            </div>
          </div>
          {status && <p className="text-xs text-gray-400 mt-2">{status.message}{status.bot_username ? ` • @${status.bot_username}` : ''}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={testConnection} disabled={testing}
              className="w-full flex items-center justify-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg disabled:opacity-50">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />} Tes Koneksi
            </button>
            <button onClick={sendTestNotification} disabled={sendingTest}
              className="w-full flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:opacity-50">
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Kirim Test Notifikasi
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Menunggu (pending)</p>
          <p className="text-3xl font-bold text-yellow-600">{cfg?.pending ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Gagal</p>
          <p className="text-3xl font-bold text-red-600">{cfg?.failed ?? 0}</p>
        </div>
      </div>

      {/* Config */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">Konfigurasi Bot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
            <div className="flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={cfg?.bot_token_masked ? `Tersimpan: ${cfg.bot_token_masked}` : 'Masukkan bot token'}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => setShowToken(!showToken)} className="px-3 text-xs text-gray-500 border border-gray-300 rounded-lg">
                {showToken ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Biarkan kosong bila tidak ingin mengubah</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID</label>
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="mis. 8371576426"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button onClick={saveConfig}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 font-semibold">
          <Save className="w-4 h-4" /> Simpan Konfigurasi
        </button>
      </div>

      {/* Notification history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Riwayat Notifikasi ({notifs.length})</h2>
          <button onClick={clearProcessed}
            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800">
            <Trash2 className="w-4 h-4" /> Bersihkan yang selesai
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-14 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Belum ada notifikasi
          </div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pesan</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Retry</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {notifs.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-sm text-gray-700 max-w-md truncate">{n.message}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(n.status)}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-gray-500">{n.retry_count}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {n.created_at ? new Date(n.created_at).toLocaleString('id-ID') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-50 flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminTelegramPage;
