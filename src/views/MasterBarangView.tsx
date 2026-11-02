import React, { useState, useMemo } from 'react';
import { Product } from '../types/inventory';
import {
  createProductManual,
  updateProduct,
  deleteProduct,
  deleteMultipleProducts,
  deleteAllProducts,
  bulkUploadMasterProducts,
  normalizeText,
} from '../services/inventoryService';
import { parseExcelOrCsv, downloadMasterTemplate, ParsedRow } from '../utils/exportImport';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/NotificationToast';
import {
  Plus,
  Upload,
  Search,
  Edit2,
  Check,
  X,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Download,
  Filter,
  CheckCircle2,
  Package,
  Trash2,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';

interface MasterBarangViewProps {
  products: Product[];
  onRefreshData: () => Promise<void>;
}

export const MasterBarangView: React.FC<MasterBarangViewProps> = ({
  products,
  onRefreshData,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Manual Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addOpeningStock, setAddOpeningStock] = useState<number>(0);
  const [addMinStock, setAddMinStock] = useState<number>(0);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editMinStock, setEditMinStock] = useState<number>(0);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<'SELECTED' | 'ALL' | string>('SELECTED');
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (statusFilter === 'ACTIVE') return p.isActive;
      if (statusFilter === 'INACTIVE') return !p.isActive;
      return true;
    });
  }, [products, search, statusFilter]);

  // Select all state for current filtered view
  const isAllFilteredSelected = useMemo(() => {
    return (
      filteredProducts.length > 0 &&
      filteredProducts.every((p) => selectedIds.has(p.id))
    );
  }, [filteredProducts, selectedIds]);

  const isSomeFilteredSelected = useMemo(() => {
    return (
      filteredProducts.some((p) => selectedIds.has(p.id)) &&
      !isAllFilteredSelected
    );
  }, [filteredProducts, selectedIds, isAllFilteredSelected]);

  // Toggle selection for a single product
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all filtered products
  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      // Deselect all filtered
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      // Select all filtered
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  // Select ALL products in the entire warehouse catalog
  const handleSelectAllTotal = () => {
    setSelectedIds(new Set(products.map((p) => p.id)));
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Trigger Delete Selected
  const handleTriggerDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menghapus barang.');
      signInWithGoogle().catch(() => {});
      return;
    }
    setDeleteTarget('SELECTED');
    setConfirmInput('');
    setShowDeleteModal(true);
  };

  // Trigger Delete All
  const handleTriggerDeleteAll = () => {
    if (products.length === 0) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menghapus barang.');
      signInWithGoogle().catch(() => {});
      return;
    }
    setDeleteTarget('ALL');
    setConfirmInput('');
    setShowDeleteModal(true);
  };

  // Trigger Delete Single Product
  const handleTriggerDeleteSingle = (p: Product) => {
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menghapus barang.');
      signInWithGoogle().catch(() => {});
      return;
    }
    setDeleteTarget(p.id);
    setConfirmInput('');
    setShowDeleteModal(true);
  };

  // Execute Deletion
  const handleExecuteDelete = async () => {
    try {
      setIsDeleting(true);

      if (deleteTarget === 'ALL') {
        const total = products.length;
        await deleteAllProducts();
        setSelectedIds(new Set());
        showToast(
          'success',
          'Semua Barang Berhasil Dihapus',
          `Seluruh ${total} data master barang dan riwayat transaksi telah dihapus.`
        );
      } else if (deleteTarget === 'SELECTED') {
        const ids = Array.from(selectedIds);
        await deleteMultipleProducts(ids);
        setSelectedIds(new Set());
        showToast(
          'success',
          'Barang Terpilih Dihapus',
          `${ids.length} data barang berhasil dihapus dari sistem.`
        );
      } else if (typeof deleteTarget === 'string') {
        const targetProd = products.find((p) => p.id === deleteTarget);
        await deleteProduct(deleteTarget);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget);
          return next;
        });
        showToast(
          'success',
          'Barang Dihapus',
          `"${targetProd?.name || 'Barang'}" berhasil dihapus dari master data.`
        );
      }

      setShowDeleteModal(false);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menghapus', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Manual Add
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menambah barang.');
      try {
        await signInWithGoogle();
      } catch {
        return;
      }
      return;
    }

    if (!addName.trim()) {
      showToast('error', 'Validasi Gagal', 'Nama barang wajib diisi.');
      return;
    }

    try {
      setIsSubmittingAdd(true);
      await createProductManual(
        addName,
        Number(addOpeningStock) || 0,
        Number(addMinStock) || 0,
        user.email || 'Staf Gudang'
      );
      showToast('success', 'Barang Berhasil Ditambahkan', `"${addName}" telah didaftarkan.`);
      setShowAddModal(false);
      setAddName('');
      setAddOpeningStock(0);
      setAddMinStock(0);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menambah Barang', err?.message || 'Terjadi kesalahan.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Handle Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mengedit barang.');
      try {
        await signInWithGoogle();
      } catch {
        return;
      }
      return;
    }
    if (!editName.trim()) {
      showToast('error', 'Validasi Gagal', 'Nama barang tidak boleh kosong.');
      return;
    }

    try {
      setIsSubmittingEdit(true);
      await updateProduct(
        editingProduct.id,
        editName,
        Number(editMinStock) || 0,
        editingProduct.isActive
      );
      showToast('success', 'Data Diperbarui', `Barang "${editName}" berhasil diupdate.`);
      setEditingProduct(null);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Memperbarui', err?.message || 'Terjadi kesalahan.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Toggle Active/Inactive
  const handleToggleActive = async (p: Product) => {
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mengubah status barang.');
      try {
        await signInWithGoogle();
      } catch {
        return;
      }
      return;
    }
    try {
      await updateProduct(p.id, p.name, p.minStock, !p.isActive);
      showToast(
        'info',
        'Status Berubah',
        `"${p.name}" sekarang ${!p.isActive ? 'Aktif' : 'Nonaktif'}.`
      );
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Mengubah Status', err?.message || 'Terjadi kesalahan.');
    }
  };

  // Handle File Upload Select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadFile(file);
      setUploadResult(null);
      const rows = await parseExcelOrCsv(file);
      setParsedRows(rows);
    } catch (err: any) {
      showToast('error', 'File Tidak Dapat Dibaca', err?.message || 'Gagal membaca format file.');
      setParsedRows([]);
      setUploadFile(null);
    }
  };

  // Duplicate Check for Upload Preview
  const uploadValidationStats = useMemo(() => {
    const existingNorms = new Set(products.map((p) => p.normalizedName));
    let validCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    parsedRows.forEach((r) => {
      if (r.error || !r.rawName) {
        invalidCount++;
      } else if (existingNorms.has(normalizeText(r.rawName))) {
        duplicateCount++;
      } else {
        validCount++;
      }
    });

    return { validCount, duplicateCount, invalidCount, total: parsedRows.length };
  }, [parsedRows, products]);

  // Execute Bulk Upload
  const handleConfirmUpload = async () => {
    if (parsedRows.length === 0) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mengimpor master barang.');
      try {
        await signInWithGoogle();
      } catch {
        return;
      }
      return;
    }

    const itemsToUpload = parsedRows
      .filter((r) => !r.error && r.rawName)
      .map((r) => ({
        name: r.rawName,
        qty: r.qty,
      }));

    try {
      setIsProcessingUpload(true);
      const res = await bulkUploadMasterProducts(
        itemsToUpload,
        skipDuplicates,
        user?.email || 'Staf Gudang'
      );
      setUploadResult(res);
      await onRefreshData();
      showToast(
        'success',
        'Import Selesai',
        `${res.success} barang berhasil ditambahkan, ${res.skipped} dilewati.`
      );
    } catch (err: any) {
      showToast('error', 'Import Gagal', err?.message || 'Terjadi kesalahan saat memproses file.');
    } finally {
      setIsProcessingUpload(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Master Data Barang</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar seluruh item barang gudang terpusat dan batas minimum persediaan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <button
              onClick={handleTriggerDeleteAll}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-all"
              title="Hapus seluruh master barang gudang"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Hapus Semua Barang</span>
            </button>
          )}
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Upload Excel/CSV</span>
          </button>
          <button
            onClick={() => {
              setAddName('');
              setAddOpeningStock(0);
              setAddMinStock(0);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Barang Manual</span>
          </button>
        </div>
      </div>

      {/* Floating / Active Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-bold">
              {selectedIds.size} dari {products.length} barang dipilih
            </span>
            {selectedIds.size < products.length && (
              <button
                onClick={handleSelectAllTotal}
                className="ml-2 text-blue-700 underline font-semibold hover:text-blue-900 cursor-pointer"
              >
                Pilih Seluruh ({products.length}) Barang
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-medium transition-all"
            >
              Batalkan Pilihan
            </button>
            <button
              onClick={handleTriggerDeleteSelected}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus {selectedIds.size} Barang Terpilih</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama barang..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-hidden text-slate-700"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Hanya Aktif</option>
            <option value="INACTIVE">Hanya Nonaktif</option>
          </select>
          <span className="text-xs text-slate-500 whitespace-nowrap pl-2">
            Total: <strong>{filteredProducts.length}</strong> barang
          </span>
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Pilih Semua di Halaman Ini"
                    checked={isAllFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeFilteredSelected;
                    }}
                    onChange={handleToggleSelectAllFiltered}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">No</th>
                <th className="py-3 px-4">ID Barang</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4 text-right">Stok Fisik Saat Ini</th>
                <th className="py-3 px-4 text-center">Batas Minimum</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    Belum ada data barang atau tidak ditemukan.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      selectedIds.has(p.id)
                        ? 'bg-blue-50/70 hover:bg-blue-50'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${p.name}`}
                        checked={selectedIds.has(p.id)}
                        onChange={() => handleToggleSelect(p.id)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.id}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {p.name}
                      {!p.isActive && (
                        <span className="ml-2 text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-semibold">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm">
                      {p.currentStock.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500">
                      {p.minStock ? p.minStock.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                          p.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {p.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => {
                          setEditingProduct(p);
                          setEditName(p.name);
                          setEditMinStock(p.minStock || 0);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Barang"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTriggerDeleteSingle(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Hapus Barang"
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

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Tambah Barang Baru</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Barang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Produk A - Serum 30ml"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Nama barang harus unik (tidak sensitif huruf besar/kecil & spasi ganda).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Saldo Awal (Opening Stock)
                </label>
                <input
                  type="number"
                  min="0"
                  value={addOpeningStock}
                  onChange={(e) => setAddOpeningStock(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Akan otomatis dicatat sebagai transaksi Saldo Awal.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batas Stok Minimum (Opsional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={addMinStock}
                  onChange={(e) => setAddMinStock(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Sistem akan menampilkan indikator menipis jika stok mencapai angka ini.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmittingAdd ? 'Menyimpan...' : 'Simpan Barang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Edit Data Barang</h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Barang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batas Stok Minimum
                </label>
                <input
                  type="number"
                  min="0"
                  value={editMinStock}
                  onChange={(e) => setEditMinStock(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
                Stok fisik saat ini: <strong>{editingProduct.currentStock}</strong> unit.
                (Stok berjalan hanya dapat diubah melalui Stok Masuk, Keluar, atau Stok Opname).
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmittingEdit ? 'Menyimpan...' : 'Perbarui'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Master Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Upload Master Barang (Excel / CSV)
                </h3>
                <p className="text-xs text-slate-500">
                  Import daftar barang dan saldo awal secara massal
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setParsedRows([]);
                  setUploadFile(null);
                  setUploadResult(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template download & file chooser */}
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between bg-blue-50/70 p-3 rounded-xl border border-blue-100 text-xs text-blue-900">
                <div>
                  <p className="font-semibold">Format kolom file:</p>
                  <p className="text-[11px] text-blue-700">
                    Kolom 1: <strong>Nama Barang</strong> | Kolom 2: <strong>Qty</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadMasterTemplate('xlsx')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded-lg font-medium hover:bg-blue-50 text-[11px]"
                  >
                    <Download className="w-3 h-3" /> Unduh .XLSX
                  </button>
                  <button
                    onClick={() => downloadMasterTemplate('csv')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded-lg font-medium hover:bg-blue-50 text-[11px]"
                  >
                    <Download className="w-3 h-3" /> Unduh .CSV
                  </button>
                </div>
              </div>

              {/* Upload Input */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  id="masterFileInput"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="masterFileInput"
                  className="cursor-pointer flex flex-col items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-10 h-10 text-blue-600" />
                  <p className="text-xs font-medium text-slate-700">
                    {uploadFile ? uploadFile.name : 'Klik untuk memilih file Excel atau CSV'}
                  </p>
                  <p className="text-[10px] text-slate-400">Mendukung .xlsx, .xls, .csv</p>
                </label>
              </div>

              {/* Options */}
              <div className="flex items-center justify-between py-2 border-y border-slate-100 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Lewati otomatis jika barang sudah terdaftar di database</span>
                </label>
              </div>

              {/* Preview Stats */}
              {parsedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-slate-500 text-[10px]">Total Baris</p>
                      <p className="font-bold text-slate-800">{uploadValidationStats.total}</p>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                      <p className="text-emerald-700 text-[10px]">Baru (Valid)</p>
                      <p className="font-bold text-emerald-800">{uploadValidationStats.validCount}</p>
                    </div>
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="text-amber-700 text-[10px]">Sudah Ada</p>
                      <p className="font-bold text-amber-800">{uploadValidationStats.duplicateCount}</p>
                    </div>
                    <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                      <p className="text-rose-700 text-[10px]">Format Error</p>
                      <p className="font-bold text-rose-800">{uploadValidationStats.invalidCount}</p>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Baris</th>
                          <th className="py-2 px-3">Nama Barang</th>
                          <th className="py-2 px-3 text-right">Saldo Awal (Qty)</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.slice(0, 20).map((r) => {
                          const isDupe = products.some(
                            (p) => p.normalizedName === normalizeText(r.rawName)
                          );
                          return (
                            <tr key={r.rowNumber} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                {r.rowNumber}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">{r.rawName}</td>
                              <td className="py-2 px-3 text-right font-bold">{r.qty}</td>
                              <td className="py-2 px-3 text-center">
                                {r.error ? (
                                  <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded font-semibold">
                                    {r.error}
                                  </span>
                                ) : isDupe ? (
                                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-semibold">
                                    Sudah Ada (Akan {skipDuplicates ? 'Dilewati' : 'Gagal'})
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">
                                    Siap Dibuat
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload Result Feedback */}
              {uploadResult && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Laporan Hasil Import</span>
                  </div>
                  <p className="text-slate-600">
                    Berhasil: <strong>{uploadResult.success}</strong> | Dilewati:{' '}
                    <strong>{uploadResult.skipped}</strong> | Gagal:{' '}
                    <strong>{uploadResult.failed}</strong>
                  </p>
                  {uploadResult.errors.length > 0 && (
                    <div className="text-rose-600 bg-rose-50 p-2.5 rounded-lg text-[11px] max-h-24 overflow-y-auto">
                      {uploadResult.errors.map((e, idx) => (
                        <p key={idx}>&bull; {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setParsedRows([]);
                    setUploadFile(null);
                    setUploadResult(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={parsedRows.length === 0 || isProcessingUpload}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isProcessingUpload ? 'Memproses...' : 'Konfirmasi Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800">
                  {deleteTarget === 'ALL'
                    ? 'Hapus Semua Master Barang?'
                    : deleteTarget === 'SELECTED'
                    ? `Hapus ${selectedIds.size} Barang Terpilih?`
                    : 'Hapus Barang Ini?'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {deleteTarget === 'ALL'
                    ? `Tindakan ini akan menghapus SEMUA (${products.length}) data master barang beserta riwayat transaksi persediaan terkait secara permanen.`
                    : deleteTarget === 'SELECTED'
                    ? `Sebanyak ${selectedIds.size} barang terpilih beserta riwayat transaksinya akan dihapus permanen dari sistem.`
                    : `Barang "${products.find((p) => p.id === deleteTarget)?.name}" beserta riwayat transaksinya akan dihapus permanen.`}
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If Selected: preview items */}
            {deleteTarget === 'SELECTED' && (
              <div className="my-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs max-h-36 overflow-y-auto">
                <p className="font-semibold text-slate-700 mb-1">Daftar barang yang akan dihapus:</p>
                <ul className="space-y-1 text-slate-600 list-disc pl-4 text-[11px]">
                  {Array.from(selectedIds)
                    .slice(0, 8)
                    .map((id) => {
                      const prod = products.find((p) => p.id === id);
                      return <li key={id}>{prod?.name || id}</li>;
                    })}
                  {selectedIds.size > 8 && (
                    <li className="font-semibold text-slate-500">
                      ...dan {selectedIds.size - 8} barang lainnya
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* If ALL: Safety verification input */}
            {deleteTarget === 'ALL' && (
              <div className="my-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                <p className="font-bold text-rose-900">
                  Konfirmasi Pengamanan:
                </p>
                <p className="text-[11px] text-rose-700">
                  Untuk menghindari penghapusan tidak disengaja, ketik <strong>HAPUS SEMUA</strong> di bawah ini:
                </p>
                <input
                  type="text"
                  placeholder="Ketik HAPUS SEMUA"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-mono font-bold text-rose-900 focus:outline-hidden focus:border-rose-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-4">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  isDeleting ||
                  (deleteTarget === 'ALL' && confirmInput.trim().toUpperCase() !== 'HAPUS SEMUA')
                }
                onClick={handleExecuteDelete}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isDeleting
                    ? 'Menghapus Data...'
                    : deleteTarget === 'ALL'
                    ? 'Ya, Hapus Semua Barang'
                    : deleteTarget === 'SELECTED'
                    ? `Ya, Hapus (${selectedIds.size}) Barang`
                    : 'Ya, Hapus Barang Ini'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
