import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  ArrowLeft,
} from 'lucide-react';

const API = 'http://localhost:3000';

interface PreviewRow {
  row: number;
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
}

interface PreviewResult {
  total: number;
  valid: number;
  invalid: number;
  products: PreviewRow[];
  errors: { row: number; message: string }[];
}

// Target kolom aplikasi + alias header yang dikenali (auto-detect saat mapping).
// `status` belum dikenali -> default 'Aktif' di backend bila tidak dipetakan.
const TARGET_FIELDS: { key: string; label: string; aliases: string[]; required?: boolean }[] = [
  { key: 'code', label: 'Kode', aliases: ['code', 'kode', 'kd_barang'], required: true },
  { key: 'description', label: 'Deskripsi', aliases: ['description', 'deskripsi', 'name', 'nama', 'nm_barang'], required: true },
  { key: 'brand', label: 'Brand', aliases: ['brand', 'merek'] },
  { key: 'status', label: 'Status (Aktif/Tidak Aktif)', aliases: ['status', 'aktif', 'status_jual'] },
  { key: 'note', label: 'Catatan', aliases: ['note', 'catatan', 'keterangan'] },
  { key: 'category', label: 'Kategori', aliases: ['category', 'kategori', 'kelas'] },
  { key: 'unit', label: 'Satuan', aliases: ['unit', 'satuan'] },
  { key: 'purchase_price', label: 'Harga Beli', aliases: ['purchase_price', 'harga_beli'] },
  { key: 'selling_price', label: 'Harga Jual', aliases: ['selling_price', 'harga_jual'] },
  { key: 'stock', label: 'Stok', aliases: ['stock', 'stok'] },
  { key: 'minimum_stock', label: 'Minimum Stok', aliases: ['minimum_stock', 'minimum'] },
  { key: 'barcode', label: 'Barcode', aliases: ['barcode'] },
  { key: 'ext01', label: 'Kolom Cadangan 1 (ext01)', aliases: ['ext01', 'ext1', 'cadangan1', 'cadangan_1'] },
  { key: 'ext02', label: 'Kolom Cadangan 2 (ext02)', aliases: ['ext02', 'ext2', 'cadangan2', 'cadangan_2'] },
];

const normHeader = (h: any) => String(h).trim().toLowerCase();

const autoDetectMapping = (headers: string[]): Record<string, string> => {
  const byNorm = new Map<string, string>();
  headers.forEach((h) => byNorm.set(normHeader(h), h));
  const mapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) {
    const hit = f.aliases.map(normHeader).map((a) => byNorm.get(a)).find(Boolean);
    mapping[f.key] = hit || '';
  }
  return mapping;
};

const AdminImportPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const resetAll = () => {
    setFile(null);
    setHeaders([]);
    setMapping({});
    setPreview(null);
    setRawRows([]);
    setStep('upload');
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setParsing(true);
    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (json.length === 0) throw new Error('File kosong / tidak ada baris data');
      const cols = Array.from(
        (json as any[]).reduce((set: Set<string>, r: any) => {
          Object.keys(r).forEach((k) => set.add(k));
          return set;
        }, new Set<string>())
      );
      setRawRows(json as any[]);
      setHeaders(cols);
      setMapping(autoDetectMapping(cols));
      // Langsung ke step mapping supaya user bisa memastikan pemetaan kolom baru
      // (Brand/Status/Catatan) sebelum data divalidasi backend.
      setStep('mapping');
    } catch (e: any) {
      notify(e.response?.data?.message || e.message || 'Gagal membaca file', 'error');
    } finally {
      setParsing(false);
    }
  };

  // Mapping harus eksplisit saat user menekan tombol pratinjau; kalau file sudah
  // memakai header standar, auto-detect sudah mengisinya.
  const applyMapping = async () => {
    const missing = TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
    if (missing.length) return notify(`Kolom wajib belum dipetakan: ${missing.join(', ')}`, 'error');
    setParsing(true);
    try {
      const rows = rawRows.map((r) => {
        const out: Record<string, any> = {};
        for (const f of TARGET_FIELDS) {
          const src = mapping[f.key];
          out[f.key] = src ? r[src] : '';
        }
        return out;
      });
      const res = await axios.post(`${API}/api/products/import/preview`, { rows });
      setPreview(res.data);
      setStep('preview');
    } catch (e: any) {
      notify(e.response?.data?.message || e.message || 'Gagal memproses file', 'error');
    } finally {
      setParsing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || preview.valid === 0) return notify('Tidak ada baris valid untuk diimpor', 'error');
    if (!confirm(`Impor ${preview.valid} produk ke database?`)) return;
    setImporting(true);
    try {
      const res = await axios.post(`${API}/api/products/import`, { products: preview.products });
      notify(res.data.message || 'Impor selesai', 'success');
      resetAll();
    } catch (e: any) {
      notify(e.response?.data?.message || 'Gagal mengimpor', 'error');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        code: 'CONTOH-001',
        description: 'Contoh Produk',
        brand: 'ContohBrand',
        status: 'Aktif',
        note: '',
        category: 'Flooring',
        unit: 'pcs',
        purchase_price: 10000,
        selling_price: 15000,
        stock: 10,
        minimum_stock: 5,
        barcode: '',
        ext01: '',
        ext02: '',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'template-import-produk.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" /> Import Excel
          </h1>
          <p className="text-sm text-gray-500">
            Impor data produk dari file .xlsx — langkah: Pilih File → Mapping Kolom → Pratinjau
          </p>
        </div>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg">
          <Download className="w-4 h-4" /> Unduh Template
        </button>
      </div>

      {/* Step 1: Upload */}
      <div className={`bg-white rounded-xl shadow-sm border p-6 ${step === 'upload' ? 'border-blue-200' : 'border-gray-100'}`}>
        {step !== 'upload' && (
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">File: <span className="font-medium text-gray-700">{file?.name}</span></span>
            <button onClick={resetAll} className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1">
              <X className="w-3 h-3" /> Ganti file
            </button>
          </div>
        )}
        <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          step === 'upload' ? 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30' : 'border-transparent py-3'}`}>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {step === 'upload' && <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />}
          {parsing && step === 'upload' ? (
            <p className="text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Membaca file...
            </p>
          ) : step === 'upload' ? (
            <p className="text-gray-500">Klik untuk pilih file Excel (.xlsx) atau seret ke sini</p>
          ) : null}
        </label>
      </div>

      {/* Step 2: Mapping kolom */}
      {step === 'mapping' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700">Mapping Kolom</h3>
            <p className="text-xs text-gray-500 mt-1">
              Cocokkan kolom file dengan kolom aplikasi. Kolom opsional boleh dikosongkan
              (Status kosong = <span className="font-medium">Aktif</span>).
            </p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={mapping[f.key] || ''}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="">— Tidak dipakai —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="p-5 border-t border-gray-100 flex gap-3">
            <button onClick={resetAll}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2">
              <X className="w-4 h-4" /> Batal
            </button>
            <button onClick={applyMapping} disabled={parsing}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Lanjut ke Pratinjau
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && preview && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Total Baris</p>
              <p className="text-2xl font-bold text-gray-800">{preview.total}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Valid</p>
              <p className="text-2xl font-bold text-green-600">{preview.valid}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Bermasalah</p>
              <p className="text-2xl font-bold text-red-600">{preview.invalid}</p>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-5">
              <h3 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> Baris yang dilewati
              </h3>
              <ul className="text-sm text-red-600 space-y-1 max-h-40 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <li key={i}>Baris {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.products.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700">Pratinjau Data Valid ({preview.valid})</h3>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Baris', 'Kode', 'Deskripsi', 'Brand', 'Status', 'Kategori', 'Satuan', 'Harga Beli', 'Harga Jual', 'Stok'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {preview.products.map((p) => (
                      <tr key={p.row}>
                        <td className="px-4 py-2 text-xs text-gray-400">{p.row}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-800">{p.code}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{p.description}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.brand || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.category || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.unit}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">Rp {p.purchase_price.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">Rp {p.selling_price.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-5 border-t border-gray-100 flex gap-3">
                <button onClick={() => setStep('mapping')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Ubah Mapping
                </button>
                <button onClick={confirmImport} disabled={importing}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Konfirmasi Impor {preview.valid} Produk
                </button>
              </div>
            </div>
          )}
        </>
      )}

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

export default AdminImportPage;
