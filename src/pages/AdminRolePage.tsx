import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: string;
  is_system: number;
}

const roleLabel = (name: string) => {
  const map: Record<string, string> = { admin: 'Administrator', cashier: 'Kasir', developer: 'Developer' };
  return map[name] || name;
};

const AdminRolePage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; permissions: string[] }>({
    name: '', description: '', permissions: [],
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await axios.get(`${API}/api/roles`);
      setRoles(res.data.roles || []);
      setAllPerms(res.data.all_permissions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', description: '', permissions: [] });
    setShowModal(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({
      name: r.name,
      description: r.description || '',
      permissions: r.name === 'admin' ? allPerms : (r.permissions ? r.permissions.split(',').map(s => s.trim()).filter(Boolean) : []),
    });
    setShowModal(true);
  };

  const togglePerm = (p: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, permissions: form.permissions };
      if (editing) {
        await axios.put(`${API}/api/roles/${editing.id}`, payload);
        notify('Role diperbarui', 'success');
      } else {
        await axios.post(`${API}/api/roles`, payload);
        notify('Role ditambahkan', 'success');
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menyimpan role', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Role) => {
    if (!confirm(`Hapus role "${r.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/roles/${r.id}`);
      notify('Role dihapus', 'success');
      await load();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal menghapus role', 'error');
    }
  };

  const permCount = (r: Role) => {
    if (r.name === 'admin') return 'Semua akses';
    if (!r.permissions) return 'Tidak ada akses';
    return `${r.permissions.split(',').filter(Boolean).length} menu`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" /> Role
          </h1>
          <p className="text-sm text-gray-500">Kelola role & hak akses menu admin</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium">
          <Plus className="w-4 h-4" /> Tambah Role
        </button>
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
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Akses</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{roleLabel(r.name)}</span>
                      <span className="text-xs text-gray-400 font-mono">({r.name})</span>
                      {r.is_system === 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          <Lock className="w-3 h-3" /> bawaan
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-500">{r.description || '-'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{permCount(r)}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => openEdit(r)} className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    {r.is_system !== 1 && (
                      <button onClick={() => remove(r)} className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 text-sm">
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    )}
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
              <h2 className="font-bold text-lg">{editing ? 'Edit Role' : 'Tambah Role'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Role *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={editing?.is_system === 1}
                  placeholder="mis. supervisor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
                <p className="text-xs text-gray-400 mt-1">Huruf kecil, angka, - dan _</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Hak Akses Menu</label>
                  {editing?.name !== 'admin' && (
                    <div className="space-x-2 text-xs">
                      <button type="button" onClick={() => setForm({ ...form, permissions: allPerms })} className="text-blue-600 hover:underline">Pilih semua</button>
                      <button type="button" onClick={() => setForm({ ...form, permissions: [] })} className="text-gray-500 hover:underline">Kosongkan</button>
                    </div>
                  )}
                </div>
                {editing?.name === 'admin' && (
                  <p className="text-xs text-amber-600 mb-2">Role admin selalu punya akses ke semua menu.</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {allPerms.map((p) => {
                    const checked = form.permissions.includes(p);
                    const disabled = editing?.name === 'admin';
                    return (
                      <label key={p} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${checked ? 'border-blue-200 bg-blue-50' : 'border-gray-200'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => togglePerm(p)} className="w-4 h-4" />
                        <span className="text-gray-700">{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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

export default AdminRolePage;
