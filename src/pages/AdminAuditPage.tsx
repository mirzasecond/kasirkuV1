import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FileSearch, Loader2, RefreshCw, Filter, X } from 'lucide-react';

const API = 'http://localhost:3000';

interface AuditLog {
  id: number;
  user_id: string | null;
  username: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-100 text-blue-700',
  create: 'bg-green-100 text-green-700',
  update: 'bg-amber-100 text-amber-700',
  delete: 'bg-red-100 text-red-700',
  backup: 'bg-purple-100 text-purple-700',
};

const AdminAuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState<{ users: string[]; actions: string[]; entities: string[] }>({ users: [], actions: [], entities: [] });
  const [loading, setLoading] = useState(true);
  const [selUser, setSelUser] = useState('');
  const [selAction, setSelAction] = useState('');
  const [selEntity, setSelEntity] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (selUser) params.set('username', selUser);
      if (selAction) params.set('action', selAction);
      if (selEntity) params.set('entity', selEntity);
      if (start && end) { params.set('start', start); params.set('end', end); }
      const res = await axios.get(`${API}/api/audit-log?${params.toString()}`);
      setLogs(res.data.logs || []);
      setFilters(res.data.filters || { users: [], actions: [], entities: [] });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selUser, selAction, selEntity, start, end]);

  const reset = () => { setSelUser(''); setSelAction(''); setSelEntity(''); setStart(''); setEnd(''); };

  const fmtDetail = (d: string | null) => {
    if (!d) return '';
    try { return JSON.stringify(JSON.parse(d), null, 2); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-blue-600" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500">Riwayat aktivitas penting (login, produk, diskon, role, user, pajak, dll)</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
            <select value={selUser} onChange={(e) => setSelUser(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua User</option>
              {filters.users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aksi</label>
            <select value={selAction} onChange={(e) => setSelAction(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Aksi</option>
              {filters.actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entitas</label>
            <select value={selEntity} onChange={(e) => setSelEntity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Entitas</option>
              {filters.entities.map((en) => <option key={en} value={en}>{en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dari</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sampai</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={reset} className="flex items-center gap-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">
            <X className="w-4 h-4" /> Reset
          </button>
          <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
            <Filter className="w-4 h-4" /> {logs.length} entri
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileSearch className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            Tidak ada log pada filter ini
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entitas</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detail</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 align-top">
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">{l.username || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ACTION_COLORS[l.action] || 'bg-gray-100 text-gray-600'}`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{l.entity}</td>
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono max-w-[120px] truncate">{l.entity_id || '-'}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {l.detail ? (
                      <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="text-blue-600 hover:underline">
                        {expanded === l.id ? 'Sembunyikan' : 'Lihat'}
                      </button>
                    ) : '-'}
                    {expanded === l.id && l.detail && (
                      <pre className="mt-2 bg-gray-900 text-green-300 text-[10px] p-2 rounded overflow-x-auto max-w-md">
                        {fmtDetail(l.detail)}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminAuditPage;
