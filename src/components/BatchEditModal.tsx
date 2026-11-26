import React, { useState, useEffect, useMemo } from 'react';
import { ImportBatch, StockTransaction, Product } from '../types/inventory';
import {
  getTransactionsByBatchId,
  updateImportBatchMetadata,
  updateImportBatchFull,
  EditBatchItemInput,
} from '../services/inventoryService';
import { formatWIBDateDisplay } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from './NotificationToast';
import { ProductCombobox } from './ProductCombobox';
import {
  X,
  Edit3,
  Save,
  Plus,
  Trash2,
  Search,
  AlertTriangle,
  Loader2,
  ShoppingBag,
  FileSpreadsheet,
  Calendar,
  FileText,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface BatchEditModalProps {
  batch: ImportBatch | null;
  allTransactions: StockTransaction[];
  products: Product[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface EditableRow {
  localKey: string;
  id?: string; // original Firestore transaction id if existing
  productId: string;
  qty: number;
  referenceNo: string;
  notes: string;
  isNew?: boolean;
  // Snapshot of original values to highlight modified rows
  origProductId?: string;
  origQty?: number;
  origReferenceNo?: string;
  origNotes?: string;
}

const ITEMS_PER_PAGE = 25;

export const BatchEditModal: React.FC<BatchEditModalProps> = ({
  batch,
  allTransactions,
  products,
  onClose,
  onSaved,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [transactionDate, setTransactionDate] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [originalTxCount, setOriginalTxCount] = useState<number>(0);
  const [originalTotalQty, setOriginalTotalQty] = useState<number>(0);
  const [originalQtyByProduct, setOriginalQtyByProduct] = useState<Map<string, number>>(new Map());

  const [isLoadingTx, setIsLoadingTx] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnlyModified, setShowOnlyModified] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  // Initialize form data when batch opens
  useEffect(() => {
    if (!batch) return;

    setTransactionDate(batch.transactionDate || '');
    setFileName(batch.fileName || '');
    setSearchQuery('');
    setShowOnlyModified(false);
    setCurrentPage(1);

    const populateRows = (txList: StockTransaction[]) => {
      const sorted = [...txList].sort((a, b) => {
        const refA = a.referenceNo || '';
        const refB = b.referenceNo || '';
        return refA.localeCompare(refB) || a.productName.localeCompare(b.productName);
      });

      const oldMap = new Map<string, number>();
      let oldTotal = 0;

      const mapped: EditableRow[] = sorted.map((tx) => {
        if (tx.direction === 'OUT') {
          oldMap.set(tx.productId, (oldMap.get(tx.productId) || 0) + tx.qty);
          oldTotal += tx.qty;
        }
        return {
          localKey: tx.id,
          id: tx.id,
          productId: tx.productId,
          qty: tx.qty,
          referenceNo: tx.referenceNo || '',
          notes: tx.notes || '',
          isNew: false,
          origProductId: tx.productId,
          origQty: tx.qty,
          origReferenceNo: tx.referenceNo || '',
          origNotes: tx.notes || '',
        };
      });

      setRows(mapped);
      setOriginalTxCount(mapped.length);
      setOriginalTotalQty(oldTotal);
      setOriginalQtyByProduct(oldMap);
    };

    const inMemory = allTransactions.filter((tx) => tx.batchId === batch.id);
    if (inMemory.length > 0) {
      populateRows(inMemory);
    } else {
      let isMounted = true;
      setIsLoadingTx(true);
      getTransactionsByBatchId(batch.id)
        .then((fetched) => {
          if (isMounted) {
            populateRows(fetched);
          }
        })
        .catch(() => {
          if (isMounted) {
            setRows([]);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingTx(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [batch, allTransactions]);

  // Helper to check if a single row was modified or added
  const isRowModified = (row: EditableRow): boolean => {
    if (row.isNew) return true;
    return (
      row.productId !== row.origProductId ||
      row.qty !== row.origQty ||
      row.referenceNo.trim() !== (row.origReferenceNo || '').trim() ||
      row.notes.trim() !== (row.origNotes || '').trim()
    );
  };

  // Detect whether metadata or items changed
  const hasMetadataChanged = useMemo(() => {
    if (!batch) return false;
    return (
      transactionDate.trim() !== batch.transactionDate ||
      fileName.trim() !== batch.fileName.trim()
    );
  }, [batch, transactionDate, fileName]);

  const hasItemsChanged = useMemo(() => {
    if (rows.length !== originalTxCount) return true;
    return rows.some((r) => isRowModified(r));
  }, [rows, originalTxCount]);

  const modifiedRowCount = useMemo(() => {
    return rows.filter((r) => isRowModified(r)).length;
  }, [rows]);

  const deletedRowCount = useMemo(() => {
    const keptExistingCount = rows.filter((r) => !r.isNew).length;
    return Math.max(0, originalTxCount - keptExistingCount);
  }, [rows, originalTxCount]);

  const newTotalQty = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number.isFinite(r.qty) && r.qty > 0 ? Math.round(r.qty) : 0), 0);
  }, [rows]);

  // Real-time stock sufficiency validation
  const stockValidationErrors = useMemo(() => {
    const newQtyMap = new Map<string, number>();
    rows.forEach((r) => {
      if (r.productId && r.qty > 0) {
        newQtyMap.set(r.productId, (newQtyMap.get(r.productId) || 0) + Math.round(r.qty));
      }
    });

    const errors: Array<{ productName: string; available: number; needed: number }> = [];

    newQtyMap.forEach((needed, pid) => {
      const prod = productMap.get(pid);
      if (!prod) return;
      const oldAllocated = originalQtyByProduct.get(pid) || 0;
      const available = prod.currentStock + oldAllocated;
      if (available < needed) {
        errors.push({
          productName: prod.name,
          available,
          needed,
        });
      }
    });

    return errors;
  }, [rows, productMap, originalQtyByProduct]);

  const hasInvalidRows = useMemo(() => {
    return rows.some((r) => !r.productId || !Number.isFinite(r.qty) || r.qty <= 0);
  }, [rows]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (showOnlyModified && !isRowModified(row)) return false;
      if (!q) return true;
      const prodName = productMap.get(row.productId)?.name.toLowerCase() || '';
      const refMatch = row.referenceNo.toLowerCase().includes(q);
      const notesMatch = row.notes.toLowerCase().includes(q);
      const idMatch = row.productId.toLowerCase().includes(q);
      return prodName.includes(q) || refMatch || notesMatch || idMatch;
    });
  }, [rows, searchQuery, showOnlyModified, productMap]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredRows, currentPage]);

  // Row mutations
  const handleRowChange = <K extends keyof EditableRow>(
    localKey: string,
    field: K,
    value: EditableRow[K]
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.localKey === localKey ? { ...r, [field]: value } : r))
    );
  };

  const handleAddRow = () => {
    const newKey = `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newRow: EditableRow = {
      localKey: newKey,
      productId: '',
      qty: 1,
      referenceNo: '',
      notes: batch ? `Penambahan item batch ${batch.platform}` : '',
      isNew: true,
    };
    setRows((prev) => [newRow, ...prev]);
    setSearchQuery('');
    setShowOnlyModified(false);
    setCurrentPage(1);
  };

  const handleRemoveRow = (localKey: string) => {
    if (rows.length <= 1) {
      showToast(
        'warning',
        'Minimal 1 Item',
        'Batch harus memiliki minimal 1 item. Gunakan tombol Hapus Batch jika ingin membatalkan seluruh batch.'
      );
      return;
    }
    setRows((prev) => prev.filter((r) => r.localKey !== localKey));
  };

  const handleResetRow = (localKey: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localKey !== localKey || r.isNew) return r;
        return {
          ...r,
          productId: r.origProductId || '',
          qty: r.origQty ?? 1,
          referenceNo: r.origReferenceNo || '',
          notes: r.origNotes || '',
        };
      })
    );
  };

  const handleSave = async () => {
    if (!batch) return;

    if (!user) {
      showToast('warning', 'Akses Ditolak', 'Silakan login terlebih dahulu untuk menyimpan perubahan batch.');
      openLoginModal();
      return;
    }

    if (!transactionDate.trim()) {
      showToast('warning', 'Tanggal Kosong', 'Tanggal transaksi wajib diisi.');
      return;
    }

    if (!fileName.trim()) {
      showToast('warning', 'Nama File Kosong', 'Nama file tidak boleh kosong.');
      return;
    }

    if (rows.length === 0) {
      showToast('warning', 'Item Kosong', 'Batch harus memiliki minimal 1 item barang.');
      return;
    }

    if (hasInvalidRows) {
      showToast('warning', 'Data Belum Lengkap', 'Pastikan seluruh baris memiliki produk yang dipilih dan qty lebih dari 0.');
      return;
    }

    if (stockValidationErrors.length > 0) {
      showToast(
        'error',
        'Stok Tidak Mencukupi',
        `Stok "${stockValidationErrors[0].productName}" tidak mencukupi (tersedia ${stockValidationErrors[0].available}, dibutuhkan ${stockValidationErrors[0].needed}).`
      );
      return;
    }

    if (!hasMetadataChanged && !hasItemsChanged) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      if (!hasItemsChanged) {
        // Fast path: metadata only (date and/or fileName)
        await updateImportBatchMetadata(batch.id, transactionDate.trim(), fileName.trim());
        await onSaved();
        showToast(
          'success',
          'Batch Berhasil Diperbarui',
          `Informasi batch ${batch.id} (Tanggal: ${formatWIBDateDisplay(transactionDate.trim())}) berhasil disimpan.`
        );
        onClose();
      } else {
        // Full update with stock recalculation
        const payload: EditBatchItemInput[] = rows.map((r) => ({
          id: r.id,
          productId: r.productId,
          qty: Math.round(r.qty),
          referenceNo: r.referenceNo.trim(),
          notes: r.notes.trim(),
        }));

        const result = await updateImportBatchFull(
          batch.id,
          transactionDate.trim(),
          fileName.trim(),
          payload,
          user.email || 'Staff'
        );

        await onSaved();
        showToast(
          'success',
          'Batch & Stok Berhasil Diperbarui',
          `Batch ${batch.id} diperbarui (${result.itemCount} item, total -${result.totalQty.toLocaleString()} unit). Saldo stok gudang telah disesuaikan otomatis.`
        );
        onClose();
      }
    } catch (err: any) {
      showToast('error', 'Gagal Menyimpan Perubahan', err?.message || 'Terjadi kesalahan saat menyimpan edit batch.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!batch) return null;

  const qtyDiff = newTotalQty - originalTotalQty;

  const platformBadge = () => {
    if (batch.platform === 'SHOPEE') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 inline-flex items-center gap-1">
          <ShoppingBag className="w-3 h-3 text-orange-600" />
          <span>Shopee</span>
        </span>
      );
    }
    if (batch.platform === 'TIKTOK') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
          <ShoppingBag className="w-3 h-3 text-purple-600" />
          <span>TikTok Shop</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
        <FileSpreadsheet className="w-3 h-3 text-blue-600" />
        <span>Penjualan Umum</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-6xl w-full h-[94vh] max-h-[860px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:px-5 border-b border-slate-200 bg-amber-50/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
              <Edit3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">
                  Edit Data Upload Batch
                </h3>
                {platformBadge()}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {batch.id}
                </span>
                <span className="text-[11px] text-slate-500">
                  Ubah tanggal transaksi, nama file, atau rincian produk &amp; qty pesanan
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors shrink-0"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Metadata Editor */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          {/* Transaction Date */}
          <div className="md:col-span-3 space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Tanggal Transaksi</span>
            </label>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              disabled={isSaving}
              className={`w-full px-3 py-2 text-xs bg-white border rounded-xl font-mono font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 ${
                transactionDate !== batch.transactionDate
                  ? 'border-amber-400 bg-amber-50/30'
                  : 'border-slate-300'
              }`}
            />
            {transactionDate !== batch.transactionDate && (
              <p className="text-[10px] text-amber-700 font-medium">
                Sebelumnya: {formatWIBDateDisplay(batch.transactionDate)}
              </p>
            )}
          </div>

          {/* File Name */}
          <div className="md:col-span-5 space-y-1">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Nama File Laporan</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={isSaving}
              placeholder="Contoh: shopee 251126.xlsx"
              className={`w-full px-3 py-2 text-xs bg-white border rounded-xl font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                fileName.trim() !== batch.fileName.trim()
                  ? 'border-amber-400 bg-amber-50/30'
                  : 'border-slate-300'
              }`}
            />
            {fileName.trim() !== batch.fileName.trim() && (
              <p className="text-[10px] text-amber-700 font-medium truncate">
                Sebelumnya: {batch.fileName}
              </p>
            )}
          </div>

          {/* Live Summary Stats */}
          <div className="md:col-span-4 grid grid-cols-2 gap-2">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                Jumlah Baris
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-sm font-bold text-slate-800">
                  {rows.length.toLocaleString()}
                </span>
                {rows.length !== originalTxCount && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    dari {originalTxCount}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
                Total Qty Keluar
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-sm font-bold text-rose-600">
                  -{newTotalQty.toLocaleString()}
                </span>
                {qtyDiff !== 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      qtyDiff > 0
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {qtyDiff > 0 ? `+${qtyDiff} keluar` : `${Math.abs(qtyDiff)} kembali`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stock Validation Error Alert */}
        {stockValidationErrors.length > 0 && (
          <div className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Stok Gudang Tidak Mencukupi untuk Perubahan Ini:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {stockValidationErrors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>
                    <strong>{err.productName}</strong> — Tersedia (termasuk alokasi batch lama):{' '}
                    <strong>{err.available}</strong>, dibutuhkan: <strong>{err.needed}</strong>
                  </li>
                ))}
                {stockValidationErrors.length > 5 && (
                  <li>...dan {stockValidationErrors.length - 5} produk lainnya.</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Item Editor Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari produk, no pesanan, atau catatan..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {(modifiedRowCount > 0 || deletedRowCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setShowOnlyModified((prev) => !prev);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                  showOnlyModified
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Diubah ({modifiedRowCount})
                {deletedRowCount > 0 ? ` • Dihapus (${deletedRowCount})` : ''}
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={isSaving || isLoadingTx}
            onClick={handleAddRow}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Item</span>
          </button>
        </div>

        {/* Editable Items Table */}
        <div className="flex-1 overflow-auto bg-white">
          {isLoadingTx ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
              <p className="text-xs font-medium">Memuat daftar item pesanan dalam batch...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              {rows.length === 0
                ? 'Tidak ada data transaksi pada batch ini.'
                : 'Tidak ada item yang cocok dengan pencarian Anda.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider sticky top-0 z-20">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3 min-w-[260px]">Nama Barang (Master)</th>
                  <th className="py-2.5 px-3 w-28 text-center">Qty Keluar</th>
                  <th className="py-2.5 px-3 min-w-[170px]">No. Pesanan / Ref</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Keterangan</th>
                  <th className="py-2.5 px-3 w-20 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedRows.map((row, idx) => {
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                  const modified = isRowModified(row);

                  // Ensure currently selected product stays selectable even if inactive
                  const rowProducts = (() => {
                    if (!row.productId) return activeProducts;
                    const alreadyInActive = activeProducts.some((p) => p.id === row.productId);
                    if (alreadyInActive) return activeProducts;
                    const inactiveProd = productMap.get(row.productId);
                    return inactiveProd ? [inactiveProd, ...activeProducts] : activeProducts;
                  })();

                  return (
                    <tr
                      key={row.localKey}
                      className={`transition-colors ${
                        row.isNew
                          ? 'bg-emerald-50/40'
                          : modified
                          ? 'bg-amber-50/40'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-500">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{globalIdx}</span>
                          {row.isNew ? (
                            <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-emerald-100 text-emerald-700">
                              Baru
                            </span>
                          ) : modified ? (
                            <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-amber-100 text-amber-800">
                              Edit
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-2 px-3">
                        <ProductCombobox
                          products={rowProducts}
                          value={row.productId}
                          onChange={(pid) => handleRowChange(row.localKey, 'productId', pid)}
                          disabled={isSaving}
                          placeholder="Ketik nama produk..."
                          stockPrefix="Stok"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          disabled={isSaving}
                          value={row.qty === 0 ? '' : row.qty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleRowChange(row.localKey, 'qty', isNaN(val) ? 0 : Math.max(0, val));
                          }}
                          className={`w-full px-2.5 py-1.5 text-xs text-center font-mono font-bold bg-white border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                            row.qty <= 0
                              ? 'border-rose-400 text-rose-700 bg-rose-50/50'
                              : !row.isNew && row.qty !== row.origQty
                              ? 'border-amber-400 text-amber-800'
                              : 'border-slate-300 text-slate-800'
                          }`}
                        />
                      </td>

                      <td className="py-2 px-3">
                        <input
                          type="text"
                          disabled={isSaving}
                          value={row.referenceNo}
                          onChange={(e) => handleRowChange(row.localKey, 'referenceNo', e.target.value)}
                          placeholder="No. Pesanan / Order ID"
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <input
                          type="text"
                          disabled={isSaving}
                          value={row.notes}
                          onChange={(e) => handleRowChange(row.localKey, 'notes', e.target.value)}
                          placeholder="Keterangan tambahan..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </td>

                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!row.isNew && modified && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleResetRow(row.localKey)}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded-lg transition-colors"
                              title="Kembalikan baris ini ke data awal"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isSaving || rows.length <= 1}
                            onClick={() => handleRemoveRow(row.localKey)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              rows.length <= 1
                                ? 'Minimal harus ada 1 item dalam batch'
                                : 'Hapus baris ini dari batch (stok dikembalikan)'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar (shown when more than 1 page) */}
        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              Menampilkan{' '}
              <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong>–
              <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredRows.length)}</strong> dari{' '}
              <strong>{filteredRows.length}</strong> item
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold px-2">
                Hal {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            {hasItemsChanged ? (
              <>
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Perubahan item akan menyesuaikan <strong>saldo stok fisik gudang</strong> secara otomatis saat disimpan.
                </span>
              </>
            ) : hasMetadataChanged ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Hanya tanggal transaksi / nama file yang diubah — saldo stok gudang tidak berubah.
                </span>
              </>
            ) : (
              <span className="text-slate-400">Belum ada perubahan data.</span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={
                isSaving ||
                isLoadingTx ||
                (!hasMetadataChanged && !hasItemsChanged) ||
                hasInvalidRows ||
                stockValidationErrors.length > 0
              }
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan Perubahan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
