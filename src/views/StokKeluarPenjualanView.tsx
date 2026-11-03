import React, { useState, useMemo } from 'react';
import {
  Product,
  ImportBatch,
  StockTransaction,
} from '../types/inventory';
import {
  recordSalesStockOutBatch,
  normalizeText,
  checkPotentialDuplicateBatch,
  deleteSingleImportBatch,
} from '../services/inventoryService';
import {
  parseExcelOrCsv,
  downloadSalesTemplate,
  ParsedRow,
} from '../utils/exportImport';
import { getTodayWIB, formatWIBDateDisplay, formatWIBDateTimeDisplay } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/NotificationToast';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Download,
  Calendar,
  History,
  Check,
  Trash2,
  CalendarX,
  Loader2,
  X,
} from 'lucide-react';

interface StokKeluarPenjualanViewProps {
  products: Product[];
  batches: ImportBatch[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
}

export const StokKeluarPenjualanView: React.FC<StokKeluarPenjualanViewProps> = ({
  products,
  batches,
  transactions,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [transactionDate, setTransactionDate] = useState<string>(getTodayWIB());
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // General Sales Batches
  const generalBatches = useMemo(() => {
    return batches.filter((b) => b.platform === 'PENJUALAN_LAIN' || b.platform === 'PENJUALAN');
  }, [batches]);

  // Handle File Select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      setFile(selectedFile);
      setDuplicateWarning(null);
      const rows = await parseExcelOrCsv(selectedFile);
      setParsedRows(rows);

      const potentialDupe = await checkPotentialDuplicateBatch(
        'PENJUALAN_LAIN',
        transactionDate,
        selectedFile.name
      );
      if (potentialDupe) {
        setDuplicateWarning(
          `Peringatan: File "${selectedFile.name}" sudah pernah di-upload untuk tanggal transaksi ${formatWIBDateDisplay(
            transactionDate
          )} (Batch ID: ${potentialDupe.id}). Harap periksa apakah file ini duplikat.`
        );
      }
    } catch (err: any) {
      showToast('error', 'Gagal Membaca File', err?.message || 'Format file tidak didukung.');
      setFile(null);
      setParsedRows([]);
    }
  };

  // Direct product lookup
  const productByName = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.normalizedName, p));
    return map;
  }, [products]);

  // Match and validate rows
  const analysis = useMemo(() => {
    let validCount = 0;
    let notFoundCount = 0;
    let formatErrorCount = 0;

    const notFoundNames = new Set<string>();
    const resolvedItems: {
      rowNumber: number;
      rawName: string;
      matchedProduct: Product | null;
      qty: number;
      orderId?: string;
      error?: string;
    }[] = [];

    const demandMap = new Map<string, number>();

    for (const r of parsedRows) {
      if (r.error || !r.rawName) {
        formatErrorCount++;
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName || '(Kosong)',
          matchedProduct: null,
          qty: r.qty,
          orderId: r.orderId,
          error: r.error || 'Nama barang kosong',
        });
        continue;
      }

      const norm = normalizeText(r.rawName);
      const matched = productByName.get(norm) || null;

      if (matched) {
        validCount++;
        demandMap.set(matched.id, (demandMap.get(matched.id) || 0) + r.qty);
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName,
          matchedProduct: matched,
          qty: r.qty,
          orderId: r.orderId,
        });
      } else {
        notFoundCount++;
        notFoundNames.add(r.rawName);
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName,
          matchedProduct: null,
          qty: r.qty,
          orderId: r.orderId,
          error: 'Barang tidak ditemukan di Master Barang.',
        });
      }
    }

    // Check stock deficits
    const stockIssues: {
      productId: string;
      productName: string;
      demanded: number;
      available: number;
      deficit: number;
    }[] = [];

    demandMap.forEach((demanded, pid) => {
      const prod = products.find((p) => p.id === pid);
      if (prod && prod.currentStock < demanded) {
        stockIssues.push({
          productId: pid,
          productName: prod.name,
          demanded,
          available: prod.currentStock,
          deficit: demanded - prod.currentStock,
        });
      }
    });

    const totalQty = resolvedItems
      .filter((it) => it.matchedProduct)
      .reduce((sum, it) => sum + it.qty, 0);

    return {
      resolvedItems,
      validCount,
      notFoundCount,
      formatErrorCount,
      notFoundNames: Array.from(notFoundNames),
      stockIssues,
      totalQty,
      canConfirm:
        parsedRows.length > 0 &&
        notFoundCount === 0 &&
        formatErrorCount === 0 &&
        stockIssues.length === 0,
    };
  }, [parsedRows, productByName, products]);

  // Execute Confirmation
  const handleConfirmImport = async () => {
    if (!analysis.canConfirm || !file) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mengimpor transaksi penjualan.');
      openLoginModal();
      return;
    }

    const itemsToProcess = analysis.resolvedItems.map((it) => ({
      productId: it.matchedProduct!.id,
      productName: it.matchedProduct!.name,
      qty: it.qty,
      orderId: it.orderId,
    }));

    try {
      setIsProcessing(true);
      const res = await recordSalesStockOutBatch(
        'PENJUALAN_LAIN',
        transactionDate,
        itemsToProcess,
        file.name,
        user?.email || 'Staf Gudang'
      );

      showToast(
        'success',
        'Import Penjualan Selesai',
        `Batch ${res.batchId} diproses: -${res.totalQty} unit stok gudang telah dikurangkan.`
      );

      setFile(null);
      setParsedRows([]);
      setDuplicateWarning(null);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Memproses File', err?.message || 'Terjadi kesalahan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google.');
      openLoginModal();
      return;
    }

    try {
      setIsDeletingBatch(true);
      const restored = await deleteSingleImportBatch(batchToDelete.id);
      await onRefreshData();
      showToast(
        'success',
        'Batch Berhasil Dihapus & Stok Dikembalikan',
        `Batch ${batchToDelete.id} (${batchToDelete.fileName}) berhasil dibatalkan. Stok sebesar ${restored.toLocaleString()} unit telah dikembalikan ke saldo gudang.`
      );
      setBatchToDelete(null);
    } catch (err: any) {
      showToast('error', 'Gagal Menghapus Batch', err?.message || 'Terjadi kesalahan.');
    } finally {
      setIsDeletingBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Stok Keluar Penjualan (Upload File)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pencatatan massal stok keluar penjualan umum dari file Excel (.xlsx) atau CSV
          </p>
        </div>
        <div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
            Hanya Kolom Nama Barang & Qty
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload form (5 cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-blue-600" />
            <span>Upload File Penjualan</span>
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Transaksi Penjualan <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <p className="font-semibold text-slate-700">Format Kolom Sederhana:</p>
              <p className="text-[10px] text-slate-500">
                1. <strong>Nama Barang</strong> | 2. <strong>Qty</strong>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => downloadSalesTemplate('Umum', 'xlsx')}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium"
              >
                .XLSX
              </button>
              <button
                onClick={() => downloadSalesTemplate('Umum', 'csv')}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium"
              >
                .CSV
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              id="generalSalesFileInput"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="generalSalesFileInput"
              className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="w-9 h-9 text-blue-600" />
              <p className="text-xs font-semibold text-slate-700">
                {file ? file.name : 'Pilih File Penjualan Excel / CSV'}
              </p>
              <p className="text-[10px] text-slate-400">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Klik untuk memilih file'}
              </p>
            </label>
          </div>

          {duplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium">{duplicateWarning}</p>
            </div>
          )}
        </div>

        {/* Validation & Preview (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Preview & Validasi Persediaan</h3>
              <p className="text-xs text-slate-500">
                Pencocokan master barang & validasi pencegahan stok minus
              </p>
            </div>
            {parsedRows.length > 0 && (
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                {parsedRows.length} Baris Data
              </span>
            )}
          </div>

          {parsedRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-xs font-medium">Belum ada file penjualan yang dipilih.</p>
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-emerald-700 text-[10px] font-semibold">Valid & Cocok</p>
                  <p className="font-extrabold text-emerald-800 text-sm">
                    {analysis.validCount} Baris
                  </p>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    analysis.notFoundCount > 0
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <p className="text-[10px] font-semibold">Tidak Ditemukan</p>
                  <p className="font-extrabold text-sm">{analysis.notFoundCount} Baris</p>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    analysis.stockIssues.length > 0
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <p className="text-[10px] font-semibold">Stok Kurang</p>
                  <p className="font-extrabold text-sm">{analysis.stockIssues.length} SKU</p>
                </div>
              </div>

              {/* Not Found Errors */}
              {analysis.notFoundNames.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-rose-600" /> Barang Tidak Ditemukan di Master:
                  </p>
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                    {analysis.notFoundNames.map((n, i) => (
                      <li key={i}>"{n}" belum terdaftar. Daftarkan di Master Barang terlebih dahulu.</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stock Deficit Warning */}
              {analysis.stockIssues.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-rose-600" /> Kuantitas Melebihi Stok Gudang:
                  </p>
                  <div className="space-y-1 text-[11px]">
                    {analysis.stockIssues.map((issue) => (
                      <div
                        key={issue.productId}
                        className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-rose-200"
                      >
                        <span className="font-medium text-slate-800">{issue.productName}</span>
                        <span className="font-bold text-rose-700">
                          Tersedia: {issue.available} | Diminta: {issue.demanded} (Kurang {issue.deficit})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="flex-1 max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Baris</th>
                      <th className="py-2 px-3">Nama Barang File</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.resolvedItems.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{it.rowNumber}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{it.rawName}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{it.qty}</td>
                        <td className="py-2 px-3 text-center">
                          {it.error ? (
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                              {it.error}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-xs">
                  <span className="text-slate-500">Total Kuantitas Keluar: </span>
                  <strong className="text-slate-800 font-bold text-sm">
                    {analysis.totalQty.toLocaleString()} Unit
                  </strong>
                </div>

                <button
                  type="button"
                  disabled={!analysis.canConfirm || isProcessing}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 shadow-xs transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isProcessing ? 'Memproses Pengurangan...' : 'Konfirmasi Import Penjualan'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Riwayat Upload Penjualan Umum
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Total {generalBatches.length} batch import
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Batch ID</th>
                <th className="py-2.5 px-3">Tanggal Transaksi</th>
                <th className="py-2.5 px-3">Waktu Import</th>
                <th className="py-2.5 px-3">Nama File</th>
                <th className="py-2.5 px-3 text-center">Jumlah Baris</th>
                <th className="py-2.5 px-3 text-right">Total Qty Dipotong</th>
                <th className="py-2.5 px-3">Pengguna</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {generalBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Belum ada riwayat import penjualan umum.
                  </td>
                </tr>
              ) : (
                generalBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{b.id}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {formatWIBDateDisplay(b.transactionDate)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {formatWIBDateTimeDisplay(b.importedAt)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{b.fileName}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{b.itemCount} item</td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                      -{b.totalQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{b.createdBy}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setBatchToDelete(b)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors touch-manipulation"
                        title="Hapus batch ini dan kembalikan stok"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Hapus & Rollback</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal: Delete Single Batch */}
      {batchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <h3 className="text-base font-bold">Hapus Batch Penjualan Ini?</h3>
              </div>
              <button
                onClick={() => setBatchToDelete(null)}
                disabled={isDeletingBatch}
                className="p-1 rounded-lg text-rose-200 hover:text-white hover:bg-rose-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-2">
                <p className="font-bold text-sm text-rose-800">
                  Rollback Stok Fisik Gudang
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>
                    ID Batch: <strong className="font-mono">{batchToDelete.id}</strong>
                  </li>
                  <li>
                    Nama File: <strong>{batchToDelete.fileName}</strong>
                  </li>
                  <li>
                    Tanggal Transaksi: <strong>{formatWIBDateDisplay(batchToDelete.transactionDate)}</strong>
                  </li>
                  <li>
                    Stok yang dikembalikan:{' '}
                    <strong className="text-emerald-700">+{batchToDelete.totalQty.toLocaleString()} Unit</strong>
                  </li>
                </ul>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                Batch dan seluruh transaksi terkait penjualan ini akan dihapus dari sistem. Saldo barang akan bertambah kembali sehingga Anda dapat meng-upload ulang file tersebut.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeletingBatch}
                  onClick={() => setBatchToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeletingBatch}
                  onClick={handleConfirmDeleteBatch}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingBatch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menghapus...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Ya, Hapus & Rollback Stok</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
