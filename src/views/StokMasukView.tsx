import React, { useState, useMemo } from 'react';
import { Product, StockTransaction } from '../types/inventory';
import {
  recordStockIn,
  deleteStockInTransaction,
  updateStockInTransaction,
} from '../services/inventoryService';
import { getTodayWIB, formatWIBDateDisplay } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/NotificationToast';
import {
  ArrowDownLeft,
  Plus,
  Trash2,
  Search,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Package,
  Edit3,
  Loader2,
  AlertTriangle,
  X,
  Download,
  FileSpreadsheet,
  FileText,
  CheckSquare,
  Square,
  MinusSquare,
  CalendarDays,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import { exportToExcel, exportToCSV } from '../utils/exportImport';

interface StokMasukViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
  initialProductId?: string | null;
}

interface ItemEntry {
  productId: string;
  qty: number;
}

export const StokMasukView: React.FC<StokMasukViewProps> = ({
  products,
  transactions,
  onRefreshData,
  initialProductId,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  const [date, setDate] = useState<string>(getTodayWIB());
  const [type, setType] = useState<'MASUK' | 'RETUR'>('MASUK');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [consignmentNo, setConsignmentNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<ItemEntry[]>(() => {
    if (initialProductId) {
      return [{ productId: initialProductId, qty: 10 }];
    }
    return [{ productId: '', qty: 1 }];
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Transaction State
  const [txToDelete, setTxToDelete] = useState<StockTransaction | null>(null);
  const [isDeletingTx, setIsDeletingTx] = useState<boolean>(false);

  // Edit Transaction State
  const [txToEdit, setTxToEdit] = useState<StockTransaction | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editType, setEditType] = useState<'MASUK' | 'RETUR'>('MASUK');
  const [editProductId, setEditProductId] = useState<string>('');
  const [editQty, setEditQty] = useState<number>(1);
  const [editRef, setEditRef] = useState<string>('');
  const [editConsignmentNo, setEditConsignmentNo] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Selection state for downloading selected transactions
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());

  // Date / Month / Year filter states
  const [dateFilterMode, setDateFilterMode] = useState<'ALL' | 'DATE' | 'MONTH'>('ALL');
  const [filterDate, setFilterDate] = useState<string>(getTodayWIB());
  const [filterMonth, setFilterMonth] = useState<number>(() => {
    const m = Number(getTodayWIB().split('-')[1]);
    return isNaN(m) ? 11 : m;
  });
  const [filterYear, setFilterYear] = useState<number>(() => {
    const y = Number(getTodayWIB().split('-')[0]);
    return isNaN(y) ? 2026 : y;
  });

  // Export Modal state
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportSource, setExportSource] = useState<'SELECTED' | 'FILTERED' | 'CUSTOM' | 'ALL'>('FILTERED');
  const [exportPeriodMode, setExportPeriodMode] = useState<'ALL' | 'DATE' | 'MONTH' | 'RANGE'>('MONTH');
  const [exportCustomDate, setExportCustomDate] = useState<string>(getTodayWIB());
  const [exportCustomMonth, setExportCustomMonth] = useState<number>(() => Number(getTodayWIB().split('-')[1]) || 11);
  const [exportCustomYear, setExportCustomYear] = useState<number>(() => Number(getTodayWIB().split('-')[0]) || 2026);
  const [exportStartDate, setExportStartDate] = useState<string>(getTodayWIB());
  const [exportEndDate, setExportEndDate] = useState<string>(getTodayWIB());
  const [exportTypeFilter, setExportTypeFilter] = useState<'ALL' | 'MASUK' | 'RETUR'>('ALL');

  // Update selected product if initialProductId changes
  React.useEffect(() => {
    if (initialProductId) {
      setItems([{ productId: initialProductId, qty: 10 }]);
      showToast('info', 'Barang Dipilih', 'Barang telah dipilih otomatis untuk pencatatan stok masuk');
    }
  }, [initialProductId]);

  // Filter history
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'MASUK' | 'RETUR'>('ALL');

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  // Statistics for stock in and retur
  const inTransactions = useMemo(() => {
    return transactions.filter((tx) => tx.type === 'MASUK' || tx.type === 'RETUR');
  }, [transactions]);

  const regularInCount = useMemo(() => {
    return inTransactions.filter((tx) => tx.type === 'MASUK').length;
  }, [inTransactions]);

  const returCount = useMemo(() => {
    return inTransactions.filter((tx) => tx.type === 'RETUR').length;
  }, [inTransactions]);

  const totalReturQty = useMemo(() => {
    return inTransactions
      .filter((tx) => tx.type === 'RETUR')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [inTransactions]);

  // History of stock in transactions (with date, month, year, search, and type filters)
  const stockInHistory = useMemo(() => {
    return inTransactions
      .filter((tx) => {
        if (filterType === 'MASUK') return tx.type === 'MASUK';
        if (filterType === 'RETUR') return tx.type === 'RETUR';
        return true;
      })
      .filter((tx) => {
        if (dateFilterMode === 'DATE') {
          return filterDate ? tx.date === filterDate : true;
        }
        if (dateFilterMode === 'MONTH') {
          const targetPrefix = `${filterYear}-${String(filterMonth).padStart(2, '0')}`;
          return tx.date.startsWith(targetPrefix);
        }
        return true;
      })
      .filter((tx) => {
        if (!searchHistory.trim()) return true;
        const q = searchHistory.toLowerCase();
        const matchName = tx.productName.toLowerCase().includes(q);
        const matchRef = (tx.referenceNo || '').toLowerCase().includes(q);
        const matchCsg = (tx.consignmentNo || '').toLowerCase().includes(q);
        const matchNotes = (tx.notes || '').toLowerCase().includes(q);
        return matchName || matchRef || matchCsg || matchNotes;
      });
  }, [inTransactions, searchHistory, dateFilterMode, filterDate, filterMonth, filterYear, filterType]);

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productId: '', qty: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'productId' | 'qty', value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mencatat stok masuk.');
      openLoginModal();
      return;
    }

    // Validations
    if (!date) {
      showToast('error', 'Validasi Gagal', 'Tanggal transaksi wajib diisi.');
      return;
    }

    const validItems: { productId: string; qty: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productId) {
        showToast('error', 'Validasi Gagal', `Baris ${i + 1}: Silakan pilih barang.`);
        return;
      }
      const qty = Number(it.qty);
      if (isNaN(qty) || qty <= 0) {
        showToast('error', 'Validasi Gagal', `Baris ${i + 1}: Kuantitas harus lebih dari 0.`);
        return;
      }
      validItems.push({ productId: it.productId, qty: Math.round(qty) });
    }

    try {
      setIsSubmitting(true);
      await recordStockIn(
        validItems,
        date,
        type,
        referenceNo.trim(),
        notes.trim(),
        user?.email || 'Staf Gudang',
        consignmentNo.trim()
      );

      const totalQty = validItems.reduce((acc, cur) => acc + cur.qty, 0);
      showToast(
        'success',
        'Stok Masuk Berhasil',
        `Berhasil mencatat penambahan ${totalQty} unit untuk ${validItems.length} jenis barang.`
      );

      // Reset form
      setItems([{ productId: '', qty: 1 }]);
      setReferenceNo('');
      setConsignmentNo('');
      setNotes('');
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Mencatat Stok Masuk', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (tx: StockTransaction) => {
    setTxToEdit(tx);
    setEditDate(tx.date);
    setEditType(tx.type === 'RETUR' ? 'RETUR' : 'MASUK');
    setEditProductId(tx.productId);
    setEditQty(tx.qty);
    setEditRef(tx.referenceNo || '');
    setEditConsignmentNo(tx.consignmentNo || '');
    setEditNotes(tx.notes || '');
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!txToDelete) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google.');
      openLoginModal();
      return;
    }

    try {
      setIsDeletingTx(true);
      const res = await deleteStockInTransaction(txToDelete.id);
      await onRefreshData();
      const label = txToDelete.type === 'RETUR' ? 'Retur Konsumen' : 'Penerimaan Stok';
      showToast(
        'success',
        `Transaksi ${label} Dihapus`,
        `Transaksi ${txToDelete.productName} (${res.qty} unit) berhasil dibatalkan dan ditarik dari saldo gudang.`
      );
      setTxToDelete(null);
    } catch (err: any) {
      showToast('error', 'Gagal Menghapus Transaksi', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsDeletingTx(false);
    }
  };

  // Confirm Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txToEdit) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google.');
      openLoginModal();
      return;
    }

    if (!editDate) {
      showToast('error', 'Validasi Gagal', 'Tanggal transaksi wajib diisi.');
      return;
    }
    if (!editProductId) {
      showToast('error', 'Validasi Gagal', 'Silakan pilih barang.');
      return;
    }
    if (editQty <= 0) {
      showToast('error', 'Validasi Gagal', 'Kuantitas harus lebih besar dari 0.');
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateStockInTransaction(
        txToEdit.id,
        editDate,
        editProductId,
        Number(editQty),
        editRef.trim(),
        editNotes.trim(),
        editType,
        editConsignmentNo.trim()
      );
      await onRefreshData();
      showToast(
        'success',
        'Transaksi Berhasil Diperbarui',
        `Perubahan pada transaksi ${editType === 'RETUR' ? 'Retur' : 'Stok Masuk'} berhasil disimpan dan stok gudang telah disesuaikan.`
      );
      setTxToEdit(null);
    } catch (err: any) {
      showToast('error', 'Gagal Memperbarui Transaksi', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Checkbox Selection Helpers
  const isAllFilteredSelected = useMemo(() => {
    return (
      stockInHistory.length > 0 &&
      stockInHistory.every((tx) => selectedTxIds.has(tx.id))
    );
  }, [stockInHistory, selectedTxIds]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(stockInHistory.map((tx) => tx.id)));
    }
  };

  const handleToggleSelectTx = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Format Data Rows for Excel / CSV Export
  const formatRowsForExport = (txList: StockTransaction[]) => {
    return txList.map((tx, idx) => ({
      No: idx + 1,
      Tanggal: formatWIBDateDisplay(tx.date),
      'No. Consignment': tx.consignmentNo || '-',
      'No. Dokumen / PO / Ref / Resi': tx.referenceNo || '-',
      'Tipe Transaksi': tx.type === 'RETUR' ? 'RETUR KONSUMEN' : 'PENERIMAAN REGULER (VENDOR)',
      'ID Barang': tx.productId,
      'Nama Barang': tx.productName,
      'Qty Masuk (Unit)': tx.qty,
      'Saldo Sesudah (Unit)': tx.balanceAfter,
      Petugas: tx.createdBy || '-',
      'Catatan / Keterangan': tx.notes || '-',
      'Waktu Pencatatan': tx.createdAt ? formatWIBDateDisplay(tx.createdAt) : '-',
    }));
  };

  // Quick Export Selected
  const handleExportSelected = () => {
    const list = inTransactions.filter((tx) => selectedTxIds.has(tx.id));
    if (list.length === 0) {
      showToast('warning', 'Tidak Ada Data Terpilih', 'Silakan centang minimal 1 transaksi di tabel.');
      return;
    }
    const data = formatRowsForExport(list);
    exportToExcel(data, 'Penerimaan Stok', `Laporan_Penerimaan_Stok_Terpilih_${Date.now()}`);
    showToast('success', 'Excel Berhasil Diunduh', `Berhasil mengunduh ${data.length} transaksi terpilih.`);
  };

  // Quick Export Filtered View
  const handleExportFiltered = () => {
    if (stockInHistory.length === 0) {
      showToast('warning', 'Data Kosong', 'Tidak ada data transaksi yang cocok dengan filter saat ini.');
      return;
    }
    const data = formatRowsForExport(stockInHistory);
    let label = 'Laporan_Penerimaan_Stok';
    if (dateFilterMode === 'DATE') {
      label += `_${filterDate}`;
    } else if (dateFilterMode === 'MONTH') {
      label += `_${MONTH_NAMES[filterMonth - 1]}_${filterYear}`;
    }
    exportToExcel(data, 'Penerimaan Stok', `${label}_${Date.now()}`);
    showToast('success', 'Excel Berhasil Diunduh', `Berhasil mengunduh ${data.length} baris laporan penerimaan stok.`);
  };

  // Export Modal Data Resolver
  const getModalExportList = (): StockTransaction[] => {
    let list = inTransactions;

    if (exportSource === 'SELECTED') {
      list = inTransactions.filter((tx) => selectedTxIds.has(tx.id));
    } else if (exportSource === 'FILTERED') {
      list = stockInHistory;
    } else if (exportSource === 'CUSTOM') {
      // Period
      if (exportPeriodMode === 'DATE') {
        list = list.filter((tx) => tx.date === exportCustomDate);
      } else if (exportPeriodMode === 'MONTH') {
        const prefix = `${exportCustomYear}-${String(exportCustomMonth).padStart(2, '0')}`;
        list = list.filter((tx) => tx.date.startsWith(prefix));
      } else if (exportPeriodMode === 'RANGE') {
        list = list.filter((tx) => tx.date >= exportStartDate && tx.date <= exportEndDate);
      }
      // Type
      if (exportTypeFilter === 'MASUK') {
        list = list.filter((tx) => tx.type === 'MASUK');
      } else if (exportTypeFilter === 'RETUR') {
        list = list.filter((tx) => tx.type === 'RETUR');
      }
    } else if (exportSource === 'ALL') {
      if (exportTypeFilter === 'MASUK') {
        list = list.filter((tx) => tx.type === 'MASUK');
      } else if (exportTypeFilter === 'RETUR') {
        list = list.filter((tx) => tx.type === 'RETUR');
      }
    }

    return list;
  };

  // Export from Modal
  const handleExecuteModalExport = (format: 'EXCEL' | 'CSV') => {
    const list = getModalExportList();
    if (list.length === 0) {
      showToast('warning', 'Data Kosong', 'Tidak ada data transaksi yang cocok dengan kriteria ekspor yang dipilih.');
      return;
    }

    const data = formatRowsForExport(list);
    let filename = 'Laporan_Penerimaan_Stok';
    if (exportSource === 'SELECTED') {
      filename += `_Terpilih_${list.length}_Item`;
    } else if (exportSource === 'CUSTOM') {
      if (exportPeriodMode === 'DATE') filename += `_${exportCustomDate}`;
      else if (exportPeriodMode === 'MONTH') filename += `_${MONTH_NAMES[exportCustomMonth - 1]}_${exportCustomYear}`;
      else if (exportPeriodMode === 'RANGE') filename += `_${exportStartDate}_sd_${exportEndDate}`;
    } else if (exportSource === 'FILTERED') {
      if (dateFilterMode === 'DATE') filename += `_${filterDate}`;
      else if (dateFilterMode === 'MONTH') filename += `_${MONTH_NAMES[filterMonth - 1]}_${filterYear}`;
    }

    if (format === 'EXCEL') {
      exportToExcel(data, 'Penerimaan Stok', `${filename}_${Date.now()}`);
      showToast('success', 'Laporan Excel Berhasil Diunduh', `Berhasil mengekspor ${data.length} transaksi penerimaan stok.`);
    } else {
      exportToCSV(data, `${filename}_${Date.now()}`);
      showToast('success', 'Laporan CSV Berhasil Diunduh', `Berhasil mengekspor ${data.length} transaksi penerimaan stok.`);
    }

    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pencatatan Stok Masuk</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Penerimaan barang dari vendor, supplier, atau retur pesanan yang layak simpan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            Penambahan Otomatis ke Saldo Gudang
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Form (5 cols) */}
        <div className={`lg:col-span-5 bg-white p-6 rounded-2xl border shadow-xs transition-colors ${
          type === 'RETUR' ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200'
        }`}>
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              {type === 'RETUR' ? (
                <>
                  <RotateCcw className="w-4 h-4 text-blue-600 animate-spin-reverse" />
                  <span className="text-blue-900">Form Retur Konsumen (Barang Diterima)</span>
                </>
              ) : (
                <>
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                  <span>Form Penerimaan Stok Reguler</span>
                </>
              )}
            </h3>
            {type === 'RETUR' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                Data Retur Tercatat
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
            {/* Tipe Penerimaan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pilih Jenis Transaksi Masuk
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('MASUK')}
                  className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                    type === 'MASUK'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Penerimaan Reguler (Vendor)
                </button>
                <button
                  type="button"
                  onClick={() => setType('RETUR')}
                  className={`py-2 px-3 rounded-xl border text-center font-medium transition-all flex items-center justify-center gap-1.5 ${
                    type === 'RETUR'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retur Konsumen / Pembeli</span>
                </button>
              </div>
              {type === 'RETUR' && (
                <p className="mt-1.5 text-[11px] text-blue-700 bg-blue-50 p-2 rounded-lg border border-blue-100 leading-relaxed">
                  💡 <strong>Catatan Retur:</strong> Barang yang diterima kembali akan otomatis menambah kuantitas stok gudang dan tersimpan dengan label <strong>RETUR</strong> untuk audit data pengembalian barang.
                </p>
              )}
            </div>

            {/* Tanggal Transaksi */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {type === 'RETUR' ? 'Tanggal Barang Diterima Kembali' : 'Tanggal Barang Diterima di Gudang'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
            </div>

            {/* Nomor Consignment (Konsinyasi) */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Nomor Consignment (Konsinyasi)</span>
                {type === 'MASUK' && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Penerimaan Reguler
                  </span>
                )}
              </label>
              <input
                type="text"
                placeholder="Contoh: CSG-2026-001 / NO-KONSINYASI-99"
                value={consignmentNo}
                onChange={(e) => setConsignmentNo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 text-slate-800 font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Nomor identitas konsinyasi / consignment penerimaan barang dari vendor partner
              </p>
            </div>

            {/* Nomor Dokumen / Referensi */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {type === 'RETUR'
                  ? 'No. Resi Retur / No. Pesanan / Order ID Marketplace'
                  : 'Nomor Dokumen / PO / Surat Jalan (Opsional)'}
              </label>
              <input
                type="text"
                placeholder={
                  type === 'RETUR'
                    ? 'Contoh: SPXID-0982312 atau ORD-SHOPEE-9912'
                    : 'Contoh: PO-2026-001 / SJ-0091'
                }
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
            </div>

            {/* List Barang */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-slate-700">Daftar Barang Masuk</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {items.map((it, idx) => {
                  const selectedProd = products.find((p) => p.id === it.productId);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200"
                    >
                      <div className="flex-1 min-w-0">
                        <select
                          required
                          value={it.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden text-slate-800"
                        >
                          <option value="">-- Pilih Barang --</option>
                          {activeProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Stok: {p.currentStock})
                            </option>
                          ))}
                        </select>
                        {selectedProd && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Stok berjalan saat ini: {selectedProd.currentStock} &rarr; Setelah masuk:{' '}
                            <span className="font-bold text-emerald-600">
                              {selectedProd.currentStock + (Number(it.qty) || 0)}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="w-24 shrink-0">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={it.qty}
                          onChange={(e) =>
                            handleItemChange(idx, 'qty', Math.max(1, Number(e.target.value)))
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right focus:outline-hidden"
                        />
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Catatan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {type === 'RETUR' ? 'Alasan Retur / Kondisi Fisik Barang' : 'Catatan / Keterangan (Opsional)'}
              </label>
              <textarea
                rows={2}
                placeholder={
                  type === 'RETUR'
                    ? 'Contoh: Konsumen salah pilih warna, barang kondisi segel baik & siap jual kembali...'
                    : 'Keterangan tambahan...'
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 rounded-xl font-bold shadow-xs transition-all disabled:opacity-50 text-xs text-white flex items-center justify-center gap-2 ${
                type === 'RETUR'
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
              }`}
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : type === 'RETUR' ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Simpan Retur & Tambahkan ke Stok Gudang</span>
                </>
              ) : (
                <span>Simpan Transaksi Stok Masuk</span>
              )}
            </button>
          </form>
        </div>

        {/* History Table (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col gap-3">
            {/* Header Title & Export Action Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">Riwayat Stok Masuk & Consignment</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {stockInHistory.length} data
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Catatan penerimaan stok vendor, pengembalian retur, dan nomor konsinyasi
                </p>
              </div>

              {/* Action Buttons: Download Excel / Modal Export */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Buka Menu Download Laporan Excel Berdasarkan Kriteria Tanggal / Pilihan"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Download Laporan Excel</span>
                </button>
              </div>
            </div>

            {/* Filter Toolbar: Mode Periode & Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              {/* Period Filter Modes: Semua Waktu, Per Tanggal, Per Bulan */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  Periode:
                </span>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('ALL')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      dateFilterMode === 'ALL'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Semua Waktu
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('DATE')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      dateFilterMode === 'DATE'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Per Tanggal
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('MONTH')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      dateFilterMode === 'MONTH'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Per Bulan & Tahun
                  </button>
                </div>

                {/* Specific Date Picker */}
                {dateFilterMode === 'DATE' && (
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden font-medium text-slate-700 ml-1"
                  />
                )}

                {/* Month & Year Selectors */}
                {dateFilterMode === 'MONTH' && (
                  <div className="flex items-center gap-1 ml-1">
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(Number(e.target.value))}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-hidden"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(Number(e.target.value))}
                      className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-hidden"
                    >
                      {AVAILABLE_YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Search Box */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari barang / ref / consignment..."
                  value={searchHistory}
                  onChange={(e) => setSearchHistory(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-full sm:w-56 focus:bg-white focus:outline-hidden focus:border-blue-400"
                />
              </div>
            </div>

            {/* Quick Filter Tabs: All, Reguler, Retur */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-medium">Tipe:</span>
                <button
                  type="button"
                  onClick={() => setFilterType('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    filterType === 'ALL'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({inTransactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('MASUK')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    filterType === 'MASUK'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  Reguler ({regularInCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('RETUR')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                    filterType === 'RETUR'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Khusus Retur ({returCount})</span>
                  {totalReturQty > 0 && (
                    <span className="ml-1 text-[10px] px-1 rounded-sm bg-white/20">
                      +{totalReturQty} pcs
                    </span>
                  )}
                </button>
              </div>

              {/* Quick Export Current Filtered button */}
              {stockInHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportFiltered}
                  className="text-[11px] font-semibold text-slate-600 hover:text-emerald-700 inline-flex items-center gap-1 hover:underline"
                  title="Unduh data yang sedang tampil di tabel langsung ke Excel"
                >
                  <Download className="w-3 h-3 text-emerald-600" />
                  <span>Unduh Tampilan Ini ({stockInHistory.length})</span>
                </button>
              )}
            </div>

            {/* Selected Items Action Banner */}
            {selectedTxIds.size > 0 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-indigo-900 font-medium">
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span>
                    <strong>{selectedTxIds.size} transaksi</strong> dipilih dari tabel
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportSelected}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Excel ({selectedTxIds.size} Terpilih)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTxIds(new Set())}
                    className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs hover:underline cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 w-8 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-slate-400 hover:text-slate-700 transition-colors inline-flex items-center justify-center"
                      title={isAllFilteredSelected ? 'Batalkan pilih semua' : 'Pilih semua di tampilan ini'}
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : selectedTxIds.size > 0 ? (
                        <MinusSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Tipe</th>
                  <th className="py-2.5 px-3">No. Consignment</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3 text-right">Qty Masuk</th>
                  <th className="py-2.5 px-3 text-right">Saldo Sesudah</th>
                  <th className="py-2.5 px-3">No Ref / Catatan</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {stockInHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Belum ada transaksi stok masuk yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  stockInHistory.map((tx) => {
                    const isSelected = selectedTxIds.has(tx.id);
                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTx(tx.id)}
                            className="text-slate-400 hover:text-slate-700 transition-colors inline-flex items-center justify-center cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                          {formatWIBDateDisplay(tx.date)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              tx.type === 'RETUR'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {tx.type === 'RETUR' ? 'RETUR' : 'MASUK'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {tx.consignmentNo ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md">
                              <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>{tx.consignmentNo}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{tx.productName}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          +{tx.qty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[160px] truncate">
                          {tx.referenceNo && (
                            <span className="font-semibold text-slate-700 block text-[11px]">
                              {tx.referenceNo}
                            </span>
                          )}
                          <span className="text-[10px]">{tx.notes || '-'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(tx)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-[11px] font-semibold transition-colors"
                              title="Edit Transaksi Ini"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setTxToDelete(tx)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition-colors"
                              title="Hapus Transaksi & Tarik dari Stok"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Hapus Transaksi {txToDelete.type === 'RETUR' ? 'Retur Konsumen' : 'Stok Masuk'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Konfirmasi pembatalan pencatatan barang masuk
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingTx && setTxToDelete(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Tanggal Transaksi:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {formatWIBDateDisplay(txToDelete.date)}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Tipe:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      txToDelete.type === 'RETUR'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {txToDelete.type === 'RETUR' ? 'RETUR KONSUMEN' : 'STOK MASUK REGULER'}
                  </span>
                </div>
                <div className="flex justify-between items-start pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Barang:</span>
                  <span className="font-bold text-slate-800 text-right max-w-[200px]">
                    {txToDelete.productName}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Jumlah yang Dibatalkan:</span>
                  <span className="font-bold text-rose-600 font-mono text-sm">
                    -{txToDelete.qty.toLocaleString()} pcs
                  </span>
                </div>
                {txToDelete.referenceNo && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-slate-500 font-medium">No. Referensi / Resi:</span>
                    <span className="font-mono font-medium text-slate-700">
                      {txToDelete.referenceNo}
                    </span>
                  </div>
                )}
                {txToDelete.notes && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 font-medium">Catatan:</span>
                    <span className="text-slate-600 text-right max-w-[200px]">
                      {txToDelete.notes}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Perhatian:</strong> Menghapus transaksi ini akan secara otomatis menarik kembali{' '}
                  <strong className="text-rose-600">{txToDelete.qty} unit</strong> dari saldo stok gudang{' '}
                  <strong>{txToDelete.productName}</strong>. Jika stok fisik saat ini kurang dari jumlah tersebut, penghapusan akan dicegah demi keamanan data.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingTx}
                  onClick={() => setTxToDelete(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeletingTx}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isDeletingTx ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menghapus...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Ya, Hapus & Tarik Stok</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {txToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Edit Transaksi {txToEdit.type === 'RETUR' ? 'Retur Konsumen' : 'Stok Masuk'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Koreksi kuantitas, tanggal, jenis barang, atau nomor referensi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingEdit && setTxToEdit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tipe Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'MASUK' | 'RETUR')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="MASUK">Stok Masuk Reguler (Penerimaan Vendor / Supplier)</option>
                    <option value="RETUR">Retur Konsumen / Pembeli</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Barang <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={editProductId}
                  onChange={(e) => setEditProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-blue-500 font-medium text-slate-800"
                >
                  <option value="">-- Pilih Barang --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stok Saat Ini: {p.currentStock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kuantitas (Qty Masuk) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      required
                      value={editQty}
                      onChange={(e) => setEditQty(Math.max(1, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">
                      unit
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Qty Sebelumnya: <strong>{txToEdit.qty} unit</strong>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Ref / No. Resi / Surat Jalan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: INV-2025-001 / JP12345678"
                    value={editRef}
                    onChange={(e) => setEditRef(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Consignment (Konsinyasi)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: CSG-2026-0089 (Kosongkan jika bukan barang konsinyasi)"
                  value={editConsignmentNo}
                  onChange={(e) => setEditConsignmentNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan / Keterangan
                </label>
                <textarea
                  rows={2}
                  placeholder="Keterangan koreksi atau alasan retur..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Sistem akan otomatis menghitung selisih kuantitas baru dengan kuantitas lama dan menyesuaikan saldo stok fisik gudang secara presisi dan aman tanpa membuat stok menjadi negatif.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setTxToEdit(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan & Sesuaikan Stok</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Download Laporan Excel / CSV Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Download Laporan Stok Masuk & Consignment
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ekspor ke Excel (.xlsx) atau CSV sesuai tanggal, bulan, tahun, atau data terpilih
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Step 1: Sumber Data */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  1. Pilih Sumber / Cakupan Data:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Option: Current Filtered */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                      exportSource === 'FILTERED'
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSource"
                      checked={exportSource === 'FILTERED'}
                      onChange={() => setExportSource('FILTERED')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">Sesuai Filter Tabel</span>
                      <span className="text-[11px] text-slate-500 block">
                        {stockInHistory.length} data yang sedang tampil
                      </span>
                    </div>
                  </label>

                  {/* Option: Selected rows */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-2.5 transition-all ${
                      selectedTxIds.size === 0
                        ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50/50'
                        : exportSource === 'SELECTED'
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-xs cursor-pointer'
                        : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSource"
                      disabled={selectedTxIds.size === 0}
                      checked={exportSource === 'SELECTED'}
                      onChange={() => setExportSource('SELECTED')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">Data yang Dicentang</span>
                      <span className="text-[11px] text-slate-500 block">
                        {selectedTxIds.size > 0
                          ? `${selectedTxIds.size} baris terpilih`
                          : 'Centang di tabel dulu'}
                      </span>
                    </div>
                  </label>

                  {/* Option: Custom Date/Month/Range */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                      exportSource === 'CUSTOM'
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSource"
                      checked={exportSource === 'CUSTOM'}
                      onChange={() => setExportSource('CUSTOM')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">Pilih Tanggal / Bulan</span>
                      <span className="text-[11px] text-slate-500 block">
                        Tentukan tanggal, bulan, atau rentang
                      </span>
                    </div>
                  </label>

                  {/* Option: All Data */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                      exportSource === 'ALL'
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportSource"
                      checked={exportSource === 'ALL'}
                      onChange={() => setExportSource('ALL')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">Semua Riwayat</span>
                      <span className="text-[11px] text-slate-500 block">
                        Total {inTransactions.length} transaksi stok masuk
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Step 2: Custom Filter Options (Conditional) */}
              {exportSource === 'CUSTOM' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Pilihan Periode Waktu:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setExportPeriodMode('DATE')}
                        className={`py-1.5 px-2 rounded-lg font-semibold transition-all text-center ${
                          exportPeriodMode === 'DATE'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Per Tanggal
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportPeriodMode('MONTH')}
                        className={`py-1.5 px-2 rounded-lg font-semibold transition-all text-center ${
                          exportPeriodMode === 'MONTH'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Per Bulan & Tahun
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportPeriodMode('RANGE')}
                        className={`py-1.5 px-2 rounded-lg font-semibold transition-all text-center ${
                          exportPeriodMode === 'RANGE'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Rentang Tanggal
                      </button>
                    </div>
                  </div>

                  {/* Date Input */}
                  {exportPeriodMode === 'DATE' && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Pilih Tanggal:
                      </label>
                      <input
                        type="date"
                        value={exportCustomDate}
                        onChange={(e) => setExportCustomDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Month & Year Selectors */}
                  {exportPeriodMode === 'MONTH' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Bulan:
                        </label>
                        <select
                          value={exportCustomMonth}
                          onChange={(e) => setExportCustomMonth(Number(e.target.value))}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                        >
                          {MONTH_NAMES.map((m, idx) => (
                            <option key={m} value={idx + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Tahun:
                        </label>
                        <select
                          value={exportCustomYear}
                          onChange={(e) => setExportCustomYear(Number(e.target.value))}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                        >
                          {AVAILABLE_YEARS.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Range Inputs */}
                  {exportPeriodMode === 'RANGE' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Dari Tanggal:
                        </label>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Sampai Tanggal:
                        </label>
                        <input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Filter Type */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Filter Jenis Transaksi:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setExportTypeFilter('ALL')}
                        className={`py-1 rounded-md font-medium text-xs ${
                          exportTypeFilter === 'ALL'
                            ? 'bg-slate-800 text-white font-bold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportTypeFilter('MASUK')}
                        className={`py-1 rounded-md font-medium text-xs ${
                          exportTypeFilter === 'MASUK'
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Reguler Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportTypeFilter('RETUR')}
                        className={`py-1 rounded-md font-medium text-xs ${
                          exportTypeFilter === 'RETUR'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Retur Saja
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Preview Summary */}
              {(() => {
                const previewList = getModalExportList();
                const totalExportQty = previewList.reduce((acc, curr) => acc + curr.qty, 0);
                const hasConsignment = previewList.filter((tx) => Boolean(tx.consignmentNo)).length;

                return (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Total Data Cocok:</span>
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        {previewList.length} transaksi
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Total Kuantitas Masuk:</span>
                      <span className="font-bold text-emerald-600 font-mono">
                        +{totalExportQty.toLocaleString()} unit
                      </span>
                    </div>
                    {hasConsignment > 0 && (
                      <div className="flex justify-between items-center text-slate-600">
                        <span>Transaksi Ber-Consignment:</span>
                        <span className="font-bold text-indigo-600 font-mono">
                          {hasConsignment} transaksi
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                      Laporan mencakup kolom: <em>No, Tanggal, No. Consignment, No. Dokumen / Ref / Resi, Tipe Transaksi, ID Barang, Nama Barang, Qty Masuk, Saldo Sesudah, Petugas, Catatan</em>.
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleExecuteModalExport('EXCEL')}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteModalExport('CSV')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download CSV (.csv)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

