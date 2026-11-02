import React, { useState, useMemo } from 'react';
import { Product, ProductMapping } from '../types/inventory';
import {
  saveProductMapping,
  deleteProductMapping,
  checkInventoryConsistency,
  ConsistencyCheckResult,
} from '../services/inventoryService';
import { downloadMasterTemplate, downloadSalesTemplate } from '../utils/exportImport';
import { formatWIBDateDisplay } from '../utils/dateUtils';
import { useToast } from '../components/NotificationToast';
import { useAuth } from '../context/AuthContext';
import {
  Settings,
  Link,
  Trash2,
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
} from 'lucide-react';

interface PengaturanViewProps {
  products: Product[];
  mappings: ProductMapping[];
  onRefreshData: () => Promise<void>;
}

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  products,
  mappings,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'MAPPING' | 'AUDIT' | 'TEMPLATES'>('MAPPING');

  // Mapping Form State
  const [platform, setPlatform] = useState<'SHOPEE' | 'TIKTOK'>('SHOPEE');
  const [rawName, setRawName] = useState<string>('');
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [searchMapping, setSearchMapping] = useState<string>('');
  const [isSubmittingMapping, setIsSubmittingMapping] = useState<boolean>(false);

  // Audit State
  const [auditResults, setAuditResults] = useState<ConsistencyCheckResult[] | null>(null);
  const [isRunningAudit, setIsRunningAudit] = useState<boolean>(false);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  // Filtered Mappings
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const matchSearch =
        m.rawName.toLowerCase().includes(searchMapping.toLowerCase()) ||
        m.targetProductName.toLowerCase().includes(searchMapping.toLowerCase());
      return matchSearch;
    });
  }, [mappings, searchMapping]);

  // Handle Add Mapping
  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menambah pemetaan alias.');
      openLoginModal();
      return;
    }

    if (!rawName.trim()) {
      showToast('error', 'Validasi Gagal', 'Nama produk marketplace tidak boleh kosong.');
      return;
    }
    if (!targetProductId) {
      showToast('error', 'Validasi Gagal', 'Silakan pilih master barang gudang tujuan.');
      return;
    }

    const targetProd = products.find((p) => p.id === targetProductId);
    if (!targetProd) return;

    try {
      setIsSubmittingMapping(true);
      await saveProductMapping(platform, rawName.trim(), targetProd.id, targetProd.name);
      showToast(
        'success',
        'Alias Berhasil Disimpan',
        `"${rawName.trim()}" sekarang dipetakan ke "${targetProd.name}".`
      );
      setRawName('');
      setTargetProductId('');
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menyimpan Alias', err?.message);
    } finally {
      setIsSubmittingMapping(false);
    }
  };

  // Handle Delete Mapping
  const handleDeleteMapping = async (id: string, name: string) => {
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menghapus pemetaan.');
      openLoginModal();
      return;
    }
    try {
      await deleteProductMapping(id);
      showToast('info', 'Alias Dihapus', `Pemetaan untuk "${name}" telah dihapus.`);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menghapus', err?.message);
    }
  };

  // Run Consistency Check
  const handleRunAudit = async () => {
    try {
      setIsRunningAudit(true);
      const results = await checkInventoryConsistency();
      setAuditResults(results);

      const allConsistent = results.every((r) => r.isConsistent);
      if (allConsistent) {
        showToast(
          'success',
          'Pemeriksaan Selesai',
          `Semua ${results.length} barang memiliki saldo berjalan yang 100% konsisten dengan riwayat transaksi.`
        );
      } else {
        showToast(
          'warning',
          'Pemeriksaan Selesai',
          'Terdapat selisih antara saldo tersimpan dan rekapitulasi riwayat transaksi.'
        );
      }
    } catch (err: any) {
      showToast('error', 'Audit Gagal', err?.message);
    } finally {
      setIsRunningAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pengaturan & Audit Sistem</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen pemetaan alias produk marketplace, audit konsistensi saldo, dan unduh template berkas
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setActiveTab('MAPPING')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-all ${
            activeTab === 'MAPPING'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Link className="w-4 h-4" />
          <span>Pemetaan Alias Produk Marketplace ({mappings.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-all ${
            activeTab === 'AUDIT'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Pemeriksaan Konsistensi Saldo</span>
        </button>
        <button
          onClick={() => setActiveTab('TEMPLATES')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition-all ${
            activeTab === 'TEMPLATES'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Template Berkas Import</span>
        </button>
      </div>

      {/* TAB 1: MAPPING */}
      {activeTab === 'MAPPING' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Form (5 cols) */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Tambah Pemetaan Alias Baru</span>
            </h3>

            <p className="text-xs text-slate-500">
              Gunakan fitur ini agar nama produk panjang di Shopee atau TikTok otomatis terhubung ke satu master barang gudang yang sama.
            </p>

            <form onSubmit={handleAddMapping} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilih Marketplace <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('SHOPEE')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-all ${
                      platform === 'SHOPEE'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Shopee
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatform('TIKTOK')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition-all ${
                      platform === 'TIKTOK'
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    TikTok Shop
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Produk di Marketplace (Alias / Judul Iklan) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Serum Brand A Botol 30ml Original BPOM"
                  value={rawName}
                  onChange={(e) => setRawName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Master Barang Gudang Tujuan <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={targetProductId}
                  onChange={(e) => setTargetProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                >
                  <option value="">-- Pilih Barang di Gudang --</option>
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmittingMapping}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-all disabled:opacity-50"
              >
                {isSubmittingMapping ? 'Menyimpan...' : 'Simpan Pemetaan Alias'}
              </button>
            </form>
          </div>

          {/* List Table (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Daftar Pemetaan Alias Aktif</h3>
                <p className="text-[11px] text-slate-500">
                  Total {filteredMappings.length} aturan pencocokan otomatis
                </p>
              </div>
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari alias..."
                  value={searchMapping}
                  onChange={(e) => setSearchMapping(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Nama Produk Marketplace</th>
                    <th className="py-2.5 px-3">Master Barang Gudang</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredMappings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        Belum ada pemetaan alias.
                      </td>
                    </tr>
                  ) : (
                    filteredMappings.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.marketplace === 'SHOPEE'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-900 text-white'
                            }`}
                          >
                            {m.marketplace}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 max-w-[200px] truncate">
                          {m.rawName}
                        </td>
                        <td className="py-2.5 px-3 text-blue-700 font-semibold">
                          {m.targetProductName}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteMapping(m.id, m.rawName)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                            title="Hapus Pemetaan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATA CONSISTENCY AUDIT */}
      {activeTab === 'AUDIT' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Pemeriksaan Konsistensi Saldo vs Riwayat Transaksi
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mekanisme verifikasi matematis: Memastikan bahwa saldo fisik barang di database sama persis dengan penjumlahan seluruh transaksi masuk, keluar, dan penyesuaian dari awal waktu.
              </p>
            </div>
            <button
              onClick={handleRunAudit}
              disabled={isRunningAudit}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningAudit ? 'animate-spin' : ''}`} />
              <span>{isRunningAudit ? 'Memeriksa Saldo...' : 'Jalankan Audit Konsistensi'}</span>
            </button>
          </div>

          {!auditResults ? (
            <div className="p-10 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <ShieldCheck className="w-12 h-12 mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-medium">Audit belum dijalankan.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Klik tombol "Jalankan Audit Konsistensi" di atas untuk memverifikasi seluruh perhitungan stok.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[11px] text-slate-500">Total Barang Diaudit</p>
                  <p className="text-xl font-bold text-slate-800">{auditResults.length} SKU</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-[11px] text-emerald-700 font-semibold">100% Konsisten</p>
                  <p className="text-xl font-bold text-emerald-800">
                    {auditResults.filter((r) => r.isConsistent).length} SKU
                  </p>
                </div>
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                  <p className="text-[11px] text-rose-700 font-semibold">Selisih Matematis</p>
                  <p className="text-xl font-bold text-rose-800">
                    {auditResults.filter((r) => !r.isConsistent).length} SKU
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Nama Barang</th>
                      <th className="py-2.5 px-3 text-right">Saldo Saat Ini (DB)</th>
                      <th className="py-2.5 px-3 text-right">Hasil Rekapitulasi Ledger</th>
                      <th className="py-2.5 px-3 text-center">Status Konsistensi</th>
                      <th className="py-2.5 px-3 text-right">Total In</th>
                      <th className="py-2.5 px-3 text-right">Total Out</th>
                      <th className="py-2.5 px-3 text-right">Total Transaksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {auditResults.map((r) => (
                      <tr key={r.productId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{r.productName}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{r.dbStock}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                          {r.calculatedStock}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.isConsistent ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Konsisten
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              <AlertTriangle className="w-3.5 h-3.5" /> Selisih {r.dbStock - r.calculatedStock}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-bold">+{r.totalIn}</td>
                        <td className="py-2.5 px-3 text-right text-rose-600 font-bold">-{r.totalOut}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                          {r.transactionCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOWNLOAD TEMPLATES */}
      {activeTab === 'TEMPLATES' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">Unduh Format Template Berkas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Gunakan format resmi ini untuk memastikan data tidak mengalami error saat proses import.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Master Template */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span>Template Master Barang (Saldo Awal)</span>
              </div>
              <p className="text-xs text-slate-500">
                Format 2 kolom: <strong>Nama Barang</strong> dan <strong>Qty</strong> (saldo awal barang).
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => downloadMasterTemplate('xlsx')}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .XLSX
                </button>
                <button
                  onClick={() => downloadMasterTemplate('csv')}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .CSV
                </button>
              </div>
            </div>

            {/* Shopee Template */}
            <div className="p-5 rounded-2xl border border-orange-200 bg-orange-50/30 space-y-3">
              <div className="flex items-center gap-2 text-orange-950 font-bold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                <span>Template Penjualan Shopee</span>
              </div>
              <p className="text-xs text-slate-500">
                Format: <strong>Nama Produk</strong>, <strong>Qty</strong>, dan opsional <strong>No Pesanan</strong>.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => downloadSalesTemplate('Shopee', 'xlsx')}
                  className="px-3 py-1.5 bg-white border border-orange-300 hover:bg-orange-50 text-orange-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .XLSX
                </button>
                <button
                  onClick={() => downloadSalesTemplate('Shopee', 'csv')}
                  className="px-3 py-1.5 bg-white border border-orange-300 hover:bg-orange-50 text-orange-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .CSV
                </button>
              </div>
            </div>

            {/* TikTok Template */}
            <div className="p-5 rounded-2xl border border-slate-300 bg-slate-900 text-white space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                <span>Template Penjualan TikTok Shop</span>
              </div>
              <p className="text-xs text-slate-300">
                Format: <strong>Nama Produk</strong>, <strong>Qty</strong>, dan opsional <strong>No Pesanan</strong>.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => downloadSalesTemplate('TikTok', 'xlsx')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .XLSX
                </button>
                <button
                  onClick={() => downloadSalesTemplate('TikTok', 'csv')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .CSV
                </button>
              </div>
            </div>

            {/* Penjualan Umum Template */}
            <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/30 space-y-3">
              <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span>Template Penjualan Umum</span>
              </div>
              <p className="text-xs text-slate-500">
                Format minimalis 2 kolom: <strong>Nama Barang</strong> dan <strong>Qty</strong>.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => downloadSalesTemplate('Umum', 'xlsx')}
                  className="px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-50 text-blue-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .XLSX
                </button>
                <button
                  onClick={() => downloadSalesTemplate('Umum', 'csv')}
                  className="px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-50 text-blue-800 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh .CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
