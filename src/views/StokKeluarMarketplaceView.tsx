import React, { useState, useMemo } from 'react';
import {
  Product,
  ProductMapping,
  ImportBatch,
  StockTransaction,
} from '../types/inventory';
import {
  recordSalesStockOutBatch,
  saveProductMapping,
  normalizeText,
  checkPotentialDuplicateBatch,
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
  ShoppingBag,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Download,
  Calendar,
  History,
  Link,
  Save,
  Check,
  RefreshCw,
} from 'lucide-react';

interface StokKeluarMarketplaceViewProps {
  products: Product[];
  mappings: ProductMapping[];
  batches: ImportBatch[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
}

export const StokKeluarMarketplaceView: React.FC<StokKeluarMarketplaceViewProps> = ({
  products,
  mappings,
  batches,
  transactions,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [platform, setPlatform] = useState<'SHOPEE' | 'TIKTOK'>('SHOPEE');
  const [transactionDate, setTransactionDate] = useState<string>(getTodayWIB());
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Quick inline mapping state for unmatched products: { [rawName]: targetProductId }
  const [inlineMappings, setInlineMappings] = useState<Record<string, string>>({});

  // Active platform batches
  const platformBatches = useMemo(() => {
    return batches.filter((b) => b.platform === platform);
  }, [batches, platform]);

  // Handle File Select
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      setFile(selectedFile);
      setDuplicateWarning(null);
      const rows = await parseExcelOrCsv(selectedFile);
      setParsedRows(rows);

      // Check duplicate batch upload warning
      const potentialDupe = await checkPotentialDuplicateBatch(
        platform,
        transactionDate,
        selectedFile.name
      );
      if (potentialDupe) {
        setDuplicateWarning(
          `Peringatan: File "${selectedFile.name}" sudah pernah di-upload untuk platform ${platform} pada tanggal transaksi ${formatWIBDateDisplay(
            transactionDate
          )} (Batch ID: ${potentialDupe.id}). Harap pastikan ini bukan file pesanan yang sama.`
        );
      }
    } catch (err: any) {
      showToast('error', 'Gagal Membaca File', err?.message || 'Format file tidak didukung.');
      setFile(null);
      setParsedRows([]);
    }
  };

  // Build product lookup maps
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  // Direct product map by normalized name
  const productByName = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.normalizedName, p));
    return map;
  }, [products]);

  // Alias mapping for current platform
  const aliasMap = useMemo(() => {
    const map = new Map<string, ProductMapping>();
    mappings
      .filter((m) => m.marketplace === platform)
      .forEach((m) => map.set(m.normalizedRawName, m));
    return map;
  }, [mappings, platform]);

  // Evaluate matching and validation for every parsed row
  const analysis = useMemo(() => {
    let validRowsCount = 0;
    let unmatchedRowsCount = 0;
    let errorRowsCount = 0;

    const unmatchedDistinctNames = new Set<string>();
    const resolvedItems: {
      rowNumber: number;
      rawName: string;
      matchedProduct: Product | null;
      qty: number;
      orderId?: string;
      error?: string;
    }[] = [];

    // Aggregated demand per matched productId
    const demandPerProduct = new Map<string, number>();

    for (const r of parsedRows) {
      if (r.error || !r.rawName) {
        errorRowsCount++;
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName || '(Kosong)',
          matchedProduct: null,
          qty: r.qty,
          orderId: r.orderId,
          error: r.error || 'Nama produk kosong',
        });
        continue;
      }

      const norm = normalizeText(r.rawName);
      let matchedProd: Product | null = null;

      // 1. Direct match with master product name
      if (productByName.has(norm)) {
        matchedProd = productByName.get(norm)!;
      }
      // 2. Check saved alias mappings
      else if (aliasMap.has(norm)) {
        const targetId = aliasMap.get(norm)!.targetProductId;
        matchedProd = products.find((p) => p.id === targetId) || null;
      }
      // 3. Check temporary inline mapping selected in the UI
      else if (inlineMappings[r.rawName]) {
        const targetId = inlineMappings[r.rawName];
        matchedProd = products.find((p) => p.id === targetId) || null;
      }

      if (matchedProd) {
        validRowsCount++;
        demandPerProduct.set(
          matchedProd.id,
          (demandPerProduct.get(matchedProd.id) || 0) + r.qty
        );
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName,
          matchedProduct: matchedProd,
          qty: r.qty,
          orderId: r.orderId,
        });
      } else {
        unmatchedRowsCount++;
        unmatchedDistinctNames.add(r.rawName);
        resolvedItems.push({
          rowNumber: r.rowNumber,
          rawName: r.rawName,
          matchedProduct: null,
          qty: r.qty,
          orderId: r.orderId,
          error: 'Nama produk belum cocok dengan master barang / alias.',
        });
      }
    }

    // Check stock sufficiency for all demanded products
    const stockIssues: {
      productId: string;
      productName: string;
      demandedQty: number;
      availableStock: number;
      deficit: number;
    }[] = [];

    demandPerProduct.forEach((demanded, pid) => {
      const prod = products.find((p) => p.id === pid);
      if (prod && prod.currentStock < demanded) {
        stockIssues.push({
          productId: pid,
          productName: prod.name,
          demandedQty: demanded,
          availableStock: prod.currentStock,
          deficit: demanded - prod.currentStock,
        });
      }
    });

    const totalQty = resolvedItems
      .filter((it) => it.matchedProduct)
      .reduce((sum, it) => sum + it.qty, 0);

    return {
      resolvedItems,
      validRowsCount,
      unmatchedRowsCount,
      errorRowsCount,
      unmatchedDistinctNames: Array.from(unmatchedDistinctNames),
      demandPerProduct,
      stockIssues,
      totalQty,
      canConfirm:
        parsedRows.length > 0 &&
        unmatchedRowsCount === 0 &&
        errorRowsCount === 0 &&
        stockIssues.length === 0,
    };
  }, [parsedRows, productByName, aliasMap, inlineMappings, products]);

  // Handle saving an inline alias mapping permanently
  const handleSaveInlineMapping = async (rawName: string, targetProductId: string) => {
    if (!targetProductId) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menyimpan pemetaan.');
      openLoginModal();
      return;
    }
    const targetProd = products.find((p) => p.id === targetProductId);
    if (!targetProd) return;

    try {
      await saveProductMapping(platform, rawName, targetProd.id, targetProd.name);
      // update state
      setInlineMappings((prev) => ({ ...prev, [rawName]: targetProductId }));
      await onRefreshData();
      showToast(
        'success',
        'Pemetaan Tersimpan',
        `"${rawName}" berhasil dipetakan ke "${targetProd.name}".`
      );
    } catch (err: any) {
      showToast('error', 'Gagal Menyimpan Pemetaan', err?.message);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!analysis.canConfirm || !file) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk mengonfirmasi pemotongan stok.');
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
        platform,
        transactionDate,
        itemsToProcess,
        file.name,
        user?.email || 'Staf Gudang'
      );

      showToast(
        'success',
        'Import Berhasil Disimpan',
        `Batch ${res.batchId} diproses: -${res.totalQty} unit persediaan gudang berhasil dipotong.`
      );

      // Reset
      setFile(null);
      setParsedRows([]);
      setDuplicateWarning(null);
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Memproses Import', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Stok Keluar Marketplace</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Integrasi upload penjualan Shopee dan TikTok Shop ke satu saldo persediaan gudang terpusat
          </p>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => {
              setPlatform('SHOPEE');
              setFile(null);
              setParsedRows([]);
              setDuplicateWarning(null);
            }}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
              platform === 'SHOPEE'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white"></span>
            Penjualan Shopee
          </button>
          <button
            onClick={() => {
              setPlatform('TIKTOK');
              setFile(null);
              setParsedRows([]);
              setDuplicateWarning(null);
            }}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
              platform === 'TIKTOK'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Penjualan TikTok Shop
          </button>
        </div>
      </div>

      {/* Main Grid: Upload Area & Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload Form Box (5 cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Upload Penjualan {platform === 'SHOPEE' ? 'Shopee' : 'TikTok Shop'}</span>
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                platform === 'SHOPEE'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {platform}
            </span>
          </div>

          {/* Tanggal Transaksi */}
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
            <p className="text-[10px] text-slate-400 mt-1">
              Pilih tanggal saat pesanan dikirim atau memenuhi syarat pengurangan stok.
            </p>
          </div>

          {/* Template Download */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <p className="font-semibold text-slate-700">Format Minimal File:</p>
              <p className="text-[10px] text-slate-500">
                Kolom: <strong>Nama Produk</strong>, <strong>Qty</strong> (opsional: <strong>No Pesanan</strong>)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => downloadSalesTemplate(platform, 'xlsx')}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium"
              >
                .XLSX
              </button>
              <button
                onClick={() => downloadSalesTemplate(platform, 'csv')}
                className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md text-[10px] font-medium"
              >
                .CSV
              </button>
            </div>
          </div>

          {/* File Picker */}
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              id="marketplaceFileInput"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="marketplaceFileInput"
              className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
            >
              <FileSpreadsheet
                className={`w-9 h-9 ${
                  platform === 'SHOPEE' ? 'text-orange-500' : 'text-slate-800'
                }`}
              />
              <p className="text-xs font-semibold text-slate-700">
                {file ? file.name : 'Pilih File Penjualan (.xlsx / .csv)'}
              </p>
              <p className="text-[10px] text-slate-400">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Klik untuk memilih file dari komputer'}
              </p>
            </label>
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{duplicateWarning}</p>
                <p className="text-[10px] opacity-90">
                  Jika Anda yakin ini adalah transaksi baru, Anda dapat tetap melanjutkan konfirmasi.
                </p>
              </div>
            </div>
          )}

          {/* Important Rules Info */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> Aturan Persediaan Terpusat:
            </p>
            <p className="text-slate-600">
              Pengurangan stok langsung memotong saldo master gudang yang sama. Tidak ada stok terpisah antara Shopee dan TikTok.
            </p>
          </div>
        </div>

        {/* Validation and Preview Box (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Hasil Analisis & Validasi Data</h3>
              <p className="text-xs text-slate-500">
                Pencocokan nama produk marketplace dan verifikasi kecukupan stok gudang
              </p>
            </div>
            {parsedRows.length > 0 && (
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                Total Baris: {parsedRows.length}
              </span>
            )}
          </div>

          {parsedRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-xs font-medium">Belum ada file yang di-upload.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Silakan pilih file penjualan di sebelah kiri untuk melihat preview dan validasi stok.
              </p>
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col">
              {/* Validation Badges */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-emerald-700 text-[10px] font-semibold">Siap Diproses</p>
                  <p className="font-extrabold text-emerald-800 text-sm">
                    {analysis.validRowsCount} Baris
                  </p>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    analysis.unmatchedRowsCount > 0
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <p className="text-[10px] font-semibold">Belum Cocok (Alias)</p>
                  <p className="font-extrabold text-sm">{analysis.unmatchedRowsCount} Baris</p>
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

              {/* Stock Deficit Warning */}
              {analysis.stockIssues.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Stok Gudang Tidak Mencukupi (Transaksi Ditolak):</span>
                  </div>
                  <div className="space-y-1">
                    {analysis.stockIssues.map((issue) => (
                      <div
                        key={issue.productId}
                        className="flex justify-between items-center text-[11px] bg-white/70 p-1.5 rounded-lg border border-rose-200"
                      >
                        <span className="font-medium text-slate-800">{issue.productName}</span>
                        <span className="font-bold text-rose-700">
                          Tersedia: {issue.availableStock} | Diminta: {issue.demandedQty} (Kurang {issue.deficit})
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-rose-700 mt-1">
                    Sistem tidak mengizinkan stok negatif. Harap kurangi kuantitas file atau lakukan transaksi Stok Masuk terlebih dahulu.
                  </p>
                </div>
              )}

              {/* Unmatched Products Inline Mapping UI */}
              {analysis.unmatchedDistinctNames.length > 0 && (
                <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-xl text-xs space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Link className="w-4 h-4 text-amber-700" />
                    <span>Produk Belum Terpetakan ke Master Barang:</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Pilih master barang untuk memetakan nama produk marketplace ini. Pemetaan akan disimpan secara permanen untuk upload berikutnya!
                  </p>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {analysis.unmatchedDistinctNames.map((raw) => (
                      <div
                        key={raw}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-200"
                      >
                        <span className="font-medium text-slate-800 text-[11px] truncate max-w-xs">
                          {raw}
                        </span>
                        <div className="flex items-center gap-2">
                          <select
                            value={inlineMappings[raw] || ''}
                            onChange={(e) =>
                              setInlineMappings((prev) => ({ ...prev, [raw]: e.target.value }))
                            }
                            className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-md text-[11px] focus:outline-hidden"
                          >
                            <option value="">-- Hubungkan ke Master --</option>
                            {activeProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleSaveInlineMapping(raw, inlineMappings[raw])}
                            disabled={!inlineMappings[raw]}
                            className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[10px] font-bold disabled:opacity-40"
                          >
                            Simpan Alias
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Rows Table */}
              <div className="flex-1 max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">No</th>
                      <th className="py-2 px-3">Nama Produk File</th>
                      <th className="py-2 px-3">Master Barang Gudang</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.resolvedItems.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{it.rawName}</td>
                        <td className="py-2 px-3 text-slate-700 font-medium">
                          {it.matchedProduct ? (
                            it.matchedProduct.name
                          ) : (
                            <span className="text-amber-600 font-semibold italic text-[11px]">
                              Belum terpetakan
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{it.qty}</td>
                        <td className="py-2 px-3 text-center">
                          {it.error ? (
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                              {it.error}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              Cocok
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer Confirmation */}
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
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs transition-all flex items-center gap-2 ${
                    platform === 'SHOPEE'
                      ? 'bg-orange-500 hover:bg-orange-600 disabled:opacity-40'
                      : 'bg-slate-900 hover:bg-slate-800 disabled:opacity-40'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isProcessing ? 'Memproses Pengurangan Stok...' : 'Konfirmasi Import Penjualan'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History of Marketplace Batches */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Riwayat Upload Penjualan {platform === 'SHOPEE' ? 'Shopee' : 'TikTok Shop'}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Total {platformBatches.length} batch import tersimpan
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {platformBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Belum ada riwayat import untuk {platform}.
                  </td>
                </tr>
              ) : (
                platformBatches.map((b) => (
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
