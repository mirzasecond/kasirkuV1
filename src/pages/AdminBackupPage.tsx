import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Download,
  DatabaseBackup,
  HardDrive,
  Receipt,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface BackupItem {
  filename: string;
  size_bytes: number;
  created_at: string;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const AdminBackupPage: React.FC = () => {
  const [dbSize, setDbSize] = useState<number>(0);
  const [txCount, setTxCount] = useState<number>(0);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    try {
      const [stats, tx, list] = await Promise.all([
        axios.get(`${API}/api/developer/db-stats`),
        axios.get(`${API}/api/developer/transaction-count`),
        axios.get(`${API}/api/backups`),
      ]);
      setDbSize(stats.data.size_bytes || 0);
      setTxCount(tx.data.count || 0);
      setBackups(list.data.backups || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/api/developer/backup`);
      notify(res.data.message || 'Backup dibuat', 'success');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal membuat backup', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Endpoint unduh kini butuh sesi admin (token dikirim otomatis interceptor),
  // jadi ambil sebagai blob lalu unduh lewat link object URL.
  const download = async (filename: string) => {
    try {
      const res = await axios.get(`${API}/api/backups/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal mengunduh backup', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <DatabaseBackup className="w-6 h-6 text-blue-600" /> Backup Database
          </h1>
          <p className="text-sm text-gray-500">Buat & unduh salinan database</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
            <HardDrive className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Ukuran Database</p>
            <p className="text-2xl font-bold text-gray-800">{fmtSize(dbSize)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
            <Receipt className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Transaksi</p>
            <p className="text-2xl font-bold text-gray-800">{txCount}</p>
          </div>
        </div>
      </div>

      {/* Create backup */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <button
          onClick={createBackup}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <DatabaseBackup className="w-5 h-5" />}
          Buat Backup Sekarang
        </button>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Salinan disimpan di <span className="font-mono">data/backups/</span> dengan timestamp.
        </p>
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Riwayat Backup ({backups.length})</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-14 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <DatabaseBackup className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Belum ada backup
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama File</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu Dibuat</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ukuran</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {backups.map((b) => (
                <tr key={b.filename} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-800 font-mono">{b.filename}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {new Date(b.created_at).toLocaleString('id-ID', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{fmtSize(b.size_bytes)}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => download(b.filename)}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Download className="w-4 h-4" /> Unduh
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div
          className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-50 flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminBackupPage;
