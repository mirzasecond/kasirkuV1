import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  User,
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface AppUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email: string | null;
  active: number;
  created_at?: string;
}

interface Role {
  id: number;
  name: string;
  is_system: number;
}

const AdminUserPage: React.FC = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({
    username: '', name: '', email: '', role: '', password: '', active: true,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    try {
      const [u, r] = await Promise.all([
        axios.get(`${API}/api/users`),
        axios.get(`${API}/api/roles`),
      ]);
      setUsers(u.data.users || []);
      setRoles(r.data.roles || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ username: '', name: '', email: '', role: roles[0]?.name || 'cashier', password: '', active: true });
    setShowModal(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    setForm({ username: u.username, name: u.name, email: u.email || '', role: u.role, password: '', active: u.active === 1 });
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/api/users/${editing.id}`, {
          name: form.name, email: form.email, role: form.role, active: form.active, password: form.password || undefined,
        });
        notify('User diperbarui', 'success');
      } else {
        await axios.post(`${API}/api/users`, form);
        notify('User ditambahkan', 'success');
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: AppUser) => {
    if (!confirm(`Hapus user "${u.username}"?`)) return;
    try {
      await axios.delete(`${API}/api/users/${u.id}`);
      notify('User dihapus', 'success');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menghapus user', 'error');
    }
  };

  const roleLabel = (name: string) => ({ admin: 'Administrator', cashier: 'Kasir', developer: 'Developer' }[name] || name);

  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.active === 1).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" /> User
          </h1>
          <p className="text-sm text-gray-500">Kelola akun pengguna & role-nya</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
          <UserPlus className="w-4 h-4" /> Tambah User
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        Admin aktif: <b>{activeAdminCount}</b>. Sistem selalu menjaga minimal 1 admin aktif.
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat...
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm font-medium text-gray-800">{u.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 font-mono">{u.username}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{u.email || '-'}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{roleLabel(u.role)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.active === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active === 1 ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => remove(u)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 text-sm">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-lg">{editing ? 'Edit User' : 'Tambah User'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={!!editing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>{roleLabel(r.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editing ? 'Password Baru (kosongkan bila tidak diubah)' : 'Password *'}
                </label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? '••••••' : 'Minimal 4 karakter'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">Password disimpan sebagai hash (scrypt), tidak pernah plain text.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4" />
                Akun aktif
              </label>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={save} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? 'Simpan Perubahan' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-4 right-4 px-5 py-3 rounded-lg text-white font-semibold z-[60] flex items-center gap-2 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default AdminUserPage;
