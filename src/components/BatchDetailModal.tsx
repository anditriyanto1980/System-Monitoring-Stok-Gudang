import React, { useState, useMemo, useEffect } from 'react';
import { ImportBatch, StockTransaction, Product } from '../types/inventory';
import { getTransactionsByBatchId } from '../services/inventoryService';
import { formatWIBDateDisplay, formatWIBDateTimeDisplay } from '../utils/dateUtils';
import { exportToExcel, exportToCSV } from '../utils/exportImport';
import {
  X,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Trash2,
  Loader2,
  Package,
  ShoppingBag,
  Calendar,
  User,
  Copy,
  Check,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Info,
} from 'lucide-react';

interface BatchDetailModalProps {
  batch: ImportBatch | null;
  allTransactions: StockTransaction[];
  products: Product[];
  onClose: () => void;
  onDeleteBatch?: (batch: ImportBatch) => void;
}

interface ProductSummary {
  productId: string;
  productName: string;
  orderCount: number;
  totalQty: number;
  currentStock: number;
}

export const BatchDetailModal: React.FC<BatchDetailModalProps> = ({
  batch,
  allTransactions,
  products,
  onClose,
  onDeleteBatch,
}) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DETAIL'>('SUMMARY');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('ALL');
  const [copiedBatchId, setCopiedBatchId] = useState<boolean>(false);
  const [isLoadingTx, setIsLoadingTx] = useState<boolean>(false);
  const [fetchedTx, setFetchedTx] = useState<StockTransaction[] | null>(null);

  // Map products by ID for fast stock lookup
  const productStockMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.id, p.currentStock));
    return map;
  }, [products]);

  // Load transactions for this batch (either from memory or direct Firestore query)
  useEffect(() => {
    if (!batch) {
      setFetchedTx(null);
      return;
    }

    // Check if transactions exist in props
    const inMemory = allTransactions.filter((tx) => tx.batchId === batch.id);
    if (inMemory.length > 0) {
      setFetchedTx(inMemory);
    } else {
      // Fetch from Firestore
      let isMounted = true;
      setIsLoadingTx(true);
      getTransactionsByBatchId(batch.id)
        .then((data) => {
          if (isMounted) {
            setFetchedTx(data);
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

  // Fallback to in-memory if fetchedTx is still null
  const batchTransactions = useMemo(() => {
    if (!batch) return [];
    if (fetchedTx !== null) return fetchedTx;
    return allTransactions.filter((tx) => tx.batchId === batch.id);
  }, [batch, fetchedTx, allTransactions]);

  // Group by Product Summary
  const productSummaries: ProductSummary[] = useMemo(() => {
    const map = new Map<string, ProductSummary>();

    batchTransactions.forEach((tx) => {
      const pid = tx.productId || 'UNKNOWN';
      const existing = map.get(pid);
      if (existing) {
        existing.orderCount += 1;
        existing.totalQty += tx.qty;
      } else {
        map.set(pid, {
          productId: pid,
          productName: tx.productName,
          orderCount: 1,
          totalQty: tx.qty,
          currentStock: productStockMap.get(pid) ?? 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [batchTransactions, productStockMap]);

  // Filtered Detail Transactions
  const filteredTransactions = useMemo(() => {
    return batchTransactions.filter((tx) => {
      // Product filter
      if (selectedProductFilter !== 'ALL' && tx.productId !== selectedProductFilter) {
        return false;
      }
      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = tx.productName.toLowerCase().includes(q);
      const matchRef = (tx.referenceNo || '').toLowerCase().includes(q);
      const matchNotes = (tx.notes || '').toLowerCase().includes(q);
      return matchName || matchRef || matchNotes;
    });
  }, [batchTransactions, selectedProductFilter, searchQuery]);

  // Filtered Product Summaries
  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return productSummaries;
    const q = searchQuery.toLowerCase();
    return productSummaries.filter((ps) => ps.productName.toLowerCase().includes(q));
  }, [productSummaries, searchQuery]);

  // Copy batch ID
  const handleCopyBatchId = () => {
    if (!batch) return;
    navigator.clipboard.writeText(batch.id);
    setCopiedBatchId(true);
    setTimeout(() => setCopiedBatchId(false), 2000);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!batch) return;

    // Sheet data: details
    const exportData = batchTransactions.map((tx, idx) => ({
      No: idx + 1,
      'Nomor Pesanan / Order ID': tx.referenceNo || '-',
      'Nama Barang Master': tx.productName,
      'Qty Terpotong': tx.qty,
      'Saldo Gudang Sesudah': tx.balanceAfter,
      'Tanggal Transaksi': tx.date,
      'Waktu Catat': tx.createdAt,
      Keterangan: tx.notes || '-',
      Pengguna: tx.createdBy || batch.createdBy,
    }));

    exportToExcel(
      exportData,
      'Rincian Upload',
      `Rincian_${batch.platform}_${batch.id}_${batch.transactionDate}`
    );
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!batch) return;

    const exportData = batchTransactions.map((tx, idx) => ({
      No: idx + 1,
      'Nomor Pesanan / Order ID': tx.referenceNo || '-',
      'Nama Barang Master': tx.productName,
      'Qty Terpotong': tx.qty,
      'Saldo Gudang Sesudah': tx.balanceAfter,
      'Tanggal Transaksi': tx.date,
      'Waktu Catat': tx.createdAt,
      Keterangan: tx.notes || '-',
    }));

    exportToCSV(exportData, `Rincian_${batch.platform}_${batch.id}`);
  };

  if (!batch) return null;

  // Platform style badge
  const platformBadge = () => {
    if (batch.platform === 'SHOPEE') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-1">
          <ShoppingBag className="w-3.5 h-3.5 text-orange-600" />
          <span>Shopee</span>
        </span>
      );
    }
    if (batch.platform === 'TIKTOK') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
          <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
          <span>TikTok Shop</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
        <span>Penjualan Umum</span>
      </span>
    );
  };

  const calculatedTotalQty = batchTransactions.reduce((acc, tx) => acc + tx.qty, 0);
  const displayTotalQty = calculatedTotalQty > 0 ? calculatedTotalQty : batch.totalQty;
  const displayItemCount = batchTransactions.length > 0 ? batchTransactions.length : batch.itemCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl max-w-5xl w-full h-[92vh] max-h-[820px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">
                  Rincian Data Upload Batch
                </h3>
                {platformBadge()}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {batch.id}
                </span>
                <button
                  type="button"
                  onClick={handleCopyBatchId}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                  title="Salin Batch ID"
                >
                  {copiedBatchId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {onDeleteBatch && (
              <button
                type="button"
                onClick={() => onDeleteBatch(batch)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5"
                title="Hapus batch ini dan kembalikan stok fisik ke gudang"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Hapus & Rollback</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Batch Metadata Cards */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-400 block font-medium">Tanggal Transaksi</span>
            <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">
              {formatWIBDateDisplay(batch.transactionDate)}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Di-upload: {formatWIBDateTimeDisplay(batch.importedAt)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-400 block font-medium">Nama File Excel</span>
            <span
              className="font-semibold text-slate-800 text-xs mt-0.5 block truncate"
              title={batch.fileName}
            >
              {batch.fileName}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block truncate" title={batch.createdBy}>
              Oleh: {batch.createdBy || '-'}
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-400 block font-medium">Jumlah Pesanan / Baris</span>
            <span className="font-bold text-slate-800 text-sm mt-0.5 block">
              {displayItemCount.toLocaleString()} <span className="text-xs font-normal text-slate-500">item</span>
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Mencakup {productSummaries.length} jenis SKU
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 bg-rose-50/30">
            <span className="text-[11px] text-rose-500 block font-medium">Total Qty Dipotong</span>
            <span className="font-bold text-rose-600 text-sm mt-0.5 block">
              -{displayTotalQty.toLocaleString()}{' '}
              <span className="text-xs font-normal text-rose-500">pcs</span>
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Terkurang dari saldo gudang
            </span>
          </div>
        </div>

        {/* View Tabs & Search & Export Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setActiveTab('SUMMARY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'SUMMARY'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Rekapitulasi per Barang ({productSummaries.length} SKU)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('DETAIL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'DETAIL'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Rincian Seluruh Baris ({batchTransactions.length} Pesanan)</span>
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'DETAIL' && (
              <select
                value={selectedProductFilter}
                onChange={(e) => setSelectedProductFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-hidden max-w-[160px]"
              >
                <option value="ALL">Semua Barang</option>
                {productSummaries.map((ps) => (
                  <option key={ps.productId} value={ps.productId}>
                    {ps.productName} ({ps.totalQty} pcs)
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder={
                  activeTab === 'SUMMARY'
                    ? 'Cari nama barang...'
                    : 'Cari no pesanan / barang...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs w-44 sm:w-56 focus:outline-hidden focus:bg-white focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Unduh data batch ini dalam format Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Unduh data batch ini dalam format CSV"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingTx ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Memuat rincian transaksi batch...</p>
            </div>
          ) : activeTab === 'SUMMARY' ? (
            /* TAB 1: PRODUCT SUMMARY TABLE */
            <div className="p-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3">Nama Barang Master</th>
                      <th className="py-2.5 px-3 text-center">Jumlah Pesanan</th>
                      <th className="py-2.5 px-3 text-right">Total Qty Terpotong</th>
                      <th className="py-2.5 px-3 text-right">Rata-rata Qty/Pesanan</th>
                      <th className="py-2.5 px-3 text-right">Stok Gudang Saat Ini</th>
                      <th className="py-2.5 px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Tidak ditemukan data barang yang cocok dengan pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredSummaries.map((ps, idx) => (
                        <tr key={ps.productId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{ps.productName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {ps.productId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                            {ps.orderCount} pesanan
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-600 font-mono text-sm">
                            -{ps.totalQty.toLocaleString()} pcs
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 font-mono text-[11px]">
                            {(ps.totalQty / ps.orderCount).toFixed(1)} pcs
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                                ps.currentStock <= 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : ps.currentStock < 10
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {ps.currentStock.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProductFilter(ps.productId);
                                setActiveTab('DETAIL');
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <span>Lihat Pesanan</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredSummaries.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                      <tr>
                        <td colSpan={2} className="py-2.5 px-3 text-right uppercase">
                          Total Rekapitulasi:
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {filteredSummaries.reduce((sum, s) => sum + s.orderCount, 0)} Pesanan
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-sm">
                          -{filteredSummaries.reduce((sum, s) => sum + s.totalQty, 0).toLocaleString()} pcs
                        </td>
                        <td colSpan={3} className="py-2.5 px-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : (
            /* TAB 2: DETAILED ORDER TRANSACTIONS TABLE */
            <div className="p-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">No</th>
                      <th className="py-2.5 px-3">No. Pesanan / Order ID</th>
                      <th className="py-2.5 px-3">Nama Barang Master</th>
                      <th className="py-2.5 px-3 text-right">Qty Terpotong</th>
                      <th className="py-2.5 px-3 text-right">Saldo Sesudah</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                      <th className="py-2.5 px-3">Waktu Transaksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          {batchTransactions.length === 0
                            ? 'Belum ada rincian data transaksi pada batch ini.'
                            : 'Tidak ditemukan transaksi yang cocok dengan kriteria filter.'}
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx, idx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {tx.referenceNo || '-'}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {tx.productName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-600 font-mono">
                            -{tx.qty.toLocaleString()} pcs
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                            {tx.balanceAfter !== undefined ? tx.balanceAfter.toLocaleString() : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate">
                            {tx.notes || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                            {tx.createdAt ? formatWIBDateTimeDisplay(tx.createdAt) : tx.date}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredTransactions.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3 text-right uppercase">
                          Total Baris Terpilih ({filteredTransactions.length} baris):
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-sm">
                          -{filteredTransactions.reduce((sum, tx) => sum + tx.qty, 0).toLocaleString()} pcs
                        </td>
                        <td colSpan={3} className="py-2.5 px-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Menampilkan {activeTab === 'SUMMARY' ? productSummaries.length : filteredTransactions.length} data. Seluruh kuantitas tercatat mengurangi saldo gudang secara otomatis.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
