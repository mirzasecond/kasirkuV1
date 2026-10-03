import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { motion } from 'framer-motion';

interface Product {
  id: number;
  code: string;
  description: string;
  brand: string | null;
  status: 'Aktif' | 'Tidak Aktif';
  note: string | null;
  category: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  minimum_stock: number;
  barcode: string | null;
  active: boolean;
}

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<any>({
    code: '',
    description: '',
    brand: '',
    status: 'Aktif',
    note: '',
    category: '',
    unit: 'pcs',
    purchase_price: 0,
    selling_price: 0,
    stock: 0,
    minimum_stock: 5,
    barcode: '',
  });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [alertStatus, setAlertStatus] = useState({ pending: 0, failed: 0 });
  // Import cepat: header file + baris mentah + pemetaan kolom cadangan (opsional).
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [extMapping, setExtMapping] = useState<{ ext01: string; ext02: string }>({ ext01: '', ext02: '' });
  // Satuan yang benar-benar ada di data (untuk saran input, bukan pembatasan).
  const unitOptions = Array.from(new Set(products.map((p) => p.unit).filter(Boolean))) as string[];

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Check notification queue status on load and interval
  useEffect(() => {
    loadProducts();
    checkQueueStatus();
    
    // Poll every 30 seconds
    const interval = setInterval(() => {
      checkQueueStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const checkQueueStatus = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/notifications/queue');
      setAlertStatus({ 
        pending: response.data.pending || 0, 
        failed: response.data.failed || 0 
      });
    } catch (error) {
      console.error('Failed to check queue status:', error);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/products');
      setProducts(response.data.products);
    } catch (error) {
      console.error('Failed to load products:', error);
      showNotification('Gagal memuat produk', 'error');
    }
  };

  const handleAddProduct = async () => {
    try {
      await axios.post('http://localhost:3000/api/products', formData);
      setShowAddModal(false);
      setFormData({
        code: '',
        description: '',
        brand: '',
        status: 'Aktif',
        note: '',
        category: '',
        unit: 'pcs',
        purchase_price: 0,
        selling_price: 0,
        stock: 0,
        minimum_stock: 5,
        barcode: '',
      });
      loadProducts();
      showNotification('Produk berhasil ditambahkan', 'success');
    } catch (error: any) {
      showNotification(error.response?.data?.message || 'Gagal menambah produk', 'error');
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;

    try {
      await axios.put(`http://localhost:3000/api/products/${editingProduct.id}`, formData);
      setShowAddModal(false);
      setEditingProduct(null);
      loadProducts();
      showNotification('Produk berhasil diupdate', 'success');
    } catch (error: any) {
      showNotification(error.response?.data?.message || 'Gagal update produk', 'error');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Yakin ingin menghapus produk ini?')) return;

    try {
      await axios.delete(`http://localhost:3000/api/products/${id}`);
      loadProducts();
      showNotification('Produk berhasil dihapus', 'success');
    } catch (error: any) {
      showNotification(error.response?.data?.message || 'Gagal hapus produk', 'error');
    }
  };

  // Alias kolom cadangan — sama dengan TARGET_FIELDS di AdminImportPage (wizard).
  const EXT_ALIASES = {
    ext01: ['ext01', 'ext1', 'cadangan1', 'cadangan_1', 'kolom cadangan 1'],
    ext02: ['ext02', 'ext2', 'cadangan2', 'cadangan_2', 'kolom cadangan 2'],
  };
  const normHeader = (h: any) => String(h).trim().toLowerCase();

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      if (json.length === 0) throw new Error('File kosong / tidak ada baris data');

      const cols = Array.from(
        (json as any[]).reduce((set: Set<string>, r: any) => {
          Object.keys(r).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      // Auto-deteksi kolom cadangan (opsional, boleh dibiarkan kosong).
      const pick = (aliases: string[]) => {
        const byNorm = new Map(cols.map((c) => [normHeader(c), c]));
        return aliases.map(normHeader).map((a) => byNorm.get(a)).find(Boolean) || '';
      };
      setImportHeaders(cols);
      setImportRows(json as any[]);
      setExtMapping({ ext01: pick(EXT_ALIASES.ext01), ext02: pick(EXT_ALIASES.ext02) });
    } catch (error: any) {
      showNotification(error.response?.data?.message || error.message || 'Gagal membaca file Excel', 'error');
    }
  };

  const confirmFastImport = async () => {
    if (importRows.length === 0) return showNotification('Belum ada file yang dipilih', 'error');
    try {
      const productsToImport = importRows.map((row: any) => ({
        code: row.Kode || row.code || row.KD_BARANG,
        description: row.Deskripsi || row.description || row.Nama || row.name || row.NM_BARANG,
        brand: row.Brand || row.brand || row.Merek || row.merek || null,
        status: String(row.Status || row.status || '').toLowerCase().match(/tidak|non|inactive|0|no/)
          ? 'Tidak Aktif'
          : 'Aktif',
        note: row.Note || row.note || row.Catatan || row.catatan || null,
        category: row.Kategori || row.category || row.KELAS,
        unit: row.Satuan || row.unit || row.SATUAN || 'pcs',
        purchase_price: Number(row.Harga_Beli) || Number(row.HARGA_BELI) || 0,
        selling_price: Number(row.Harga_Jual) || Number(row.HARGA_JUAL) || 0,
        stock: Number(row.Stok) || Number(row.STOK) || 0,
        minimum_stock: 5,
        barcode: row.Barcode || null,
        ext01: extMapping.ext01 ? row[extMapping.ext01] || null : null,
        ext02: extMapping.ext02 ? row[extMapping.ext02] || null : null,
      }));

      await axios.post('http://localhost:3000/api/products/import', {
        products: productsToImport,
      });

      loadProducts();
      setShowImportModal(false);
      setImportHeaders([]);
      setImportRows([]);
      setExtMapping({ ext01: '', ext02: '' });
      showNotification(`${productsToImport.length} produk berhasil diimpor`, 'success');
    } catch (error: any) {
      showNotification(error.response?.data?.message || 'Gagal impor Excel', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Manajemen Produk</h1>
          <div className="space-x-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Import Excel
            </button>
            <button
              onClick={() => {
                setEditingProduct(null);
                setFormData({
                  code: '',
                  name: '',
                  category: '',
                  unit: 'pcs',
                  purchase_price: 0,
                  selling_price: 0,
                  stock: 0,
                  minimum_stock: 5,
                  barcode: '',
                });
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Tambah Produk
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Total Produk</div>
            <div className="text-2xl font-bold">{products.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Stok Total</div>
            <div className="text-2xl font-bold">
              {products.reduce((sum: number, p: Product) => sum + p.stock, 0)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Low Stock</div>
            <div className="text-2xl font-bold text-orange-500">
              {products.filter(p => p.stock <= p.minimum_stock).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-gray-600 text-sm">Nilai Stok</div>
            <div className="text-2xl font-bold text-green-600">
              Rp {(products.reduce((sum: number, p: Product) => sum + (p.purchase_price * p.stock), 0) / 1000000).toFixed(1)}Jt
            </div>
          </div>
          
          {/* Notification Queue Status */}
          {alertStatus.pending > 0 && (
            <div 
              onClick={() => checkQueueStatus()}
              className="bg-yellow-100 p-4 rounded-lg shadow cursor-pointer hover:bg-yellow-200 transition-colors"
            >
              <div className="text-gray-700 text-sm flex items-center justify-between">
                <span>Telegram Queue</span>
                <span className="bg-yellow-500 text-white px-2 py-1 rounded-full text-xs">
                  {alertStatus.pending}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">Pending notifications</div>
            </div>
          )}
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Produk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Kategori</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Harga Beli</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Harga Jual</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Stok</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product) => {
                const low = product.stock <= product.minimum_stock;
                const out = product.stock <= 0;
                return (
                <tr key={product.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 align-middle font-mono text-xs text-gray-700 whitespace-nowrap">{product.code}</td>
                  <td className="px-4 py-3 align-middle">
                    <div className="max-w-[16rem] truncate font-medium text-gray-800" title={product.description}>{product.description}</div>
                    {product.note && <div className="max-w-[16rem] truncate text-xs text-gray-400" title={product.note}>{product.note}</div>}
                  </td>
                  <td className="px-4 py-3 align-middle text-gray-700 whitespace-nowrap">{product.brand || '-'}</td>
                  <td className="px-4 py-3 align-middle text-center whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        product.status === 'Aktif'
                          ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                          : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                      }`}
                    >
                      {product.status || 'Aktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-gray-700 whitespace-nowrap">{product.category || '-'}</td>
                  <td className="px-4 py-3 align-middle text-center text-gray-600 whitespace-nowrap">{product.unit}</td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums text-gray-600 whitespace-nowrap">
                    {product.purchase_price > 0 ? `Rp ${product.purchase_price.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">
                    {product.selling_price > 0 ? (
                      `Rp ${product.selling_price.toLocaleString('id-ID')}`
                    ) : (
                      <span className="text-amber-600 text-xs font-medium">Belum diisi</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <span className={`inline-block tabular-nums font-semibold ${
                      out ? 'text-red-600' : low ? 'text-amber-600' : 'text-gray-800'
                    }`}>
                      {product.stock} <span className="text-xs font-normal text-gray-500">{product.unit}</span>
                    </span>
                    {out ? (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 ring-1 ring-red-200 align-middle">Habis</span>
                    ) : low ? (
                      <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 ring-1 ring-amber-200 align-middle">Menipis</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setFormData({
                            code: product.code,
                            description: product.description,
                            brand: product.brand || '',
                            status: product.status || 'Aktif',
                            note: product.note || '',
                            category: product.category || '',
                            unit: product.unit,
                            purchase_price: product.purchase_price,
                            selling_price: product.selling_price,
                            stock: product.stock,
                            minimum_stock: product.minimum_stock,
                            barcode: product.barcode || '',
                          });
                          setShowAddModal(true);
                        }}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 ring-1 ring-blue-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 ring-1 ring-red-200 transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Produk *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Produk *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Opsional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Penjualan</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="Aktif">Aktif (tampil di kasir)</option>
                  <option value="Tidak Aktif">Tidak Aktif (disembunyikan dari kasir)</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Opsional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
                {/* Bebas (datalist), bukan daftar tetap: data gudang memakai
                    BOX/PCS/TUBE/KALENG dan nilai baru harus tetap bisa dipakai. */}
                <input
                  type="text"
                  list="unit-options"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="pcs / BOX / TUBE ..."
                />
                <datalist id="unit-options">
                  {Array.from(new Set([...unitOptions, 'pcs', 'box', 'kg', 'litter', 'm', 'BOX', 'PCS', 'TUBE', 'KALENG'])).map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Beli</label>
                <input
                  type="number"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Jual</label>
                <input
                  type="number"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingProduct ? 'Stok' : 'Stok Awal'}
                </label>
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
                {editingProduct && (
                  <p className="mt-1 text-xs text-gray-500">
                    Nilai ini adalah <span className="font-medium">stok akhir</span> (menimpa, bukan menambah).
                    Untuk menambah stok gunakan menu <span className="font-medium">Tambah Stok</span>.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stok</label>
                <input
                  type="number"
                  value={formData.minimum_stock}
                  onChange={(e) => setFormData({ ...formData, minimum_stock: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={editingProduct ? handleUpdateProduct : handleAddProduct}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingProduct ? 'Update' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Import dari Excel</h2>
            <p className="text-gray-600 mb-4">Pilih file Excel (.xlsx) untuk mengimpor produk</p>
            
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-green-700
                hover:file:bg-green-100
              "
            />

            {importRows.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm text-gray-600 mb-3">
                  Kolom terbaca: <span className="font-semibold">{importRows.length} baris</span>
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Kolom cadangan bersifat opsional — biarkan &quot;Tidak dipakai&quot; bila file tidak punya kolomnya.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kolom Cadangan 1 (ext01)</label>
                    <select
                      value={extMapping.ext01}
                      onChange={(e) => setExtMapping({ ...extMapping, ext01: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                    >
                      <option value="">— Tidak dipakai —</option>
                      {importHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kolom Cadangan 2 (ext02)</label>
                    <select
                      value={extMapping.ext02}
                      onChange={(e) => setExtMapping({ ...extMapping, ext02: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                    >
                      <option value="">— Tidak dipakai —</option>
                      {importHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportHeaders([]);
                  setImportRows([]);
                  setExtMapping({ ext01: '', ext02: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={confirmFastImport}
                disabled={importRows.length === 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                Impor Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-semibold z-50 ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
