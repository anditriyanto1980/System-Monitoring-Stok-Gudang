import React, { useState, useMemo } from 'react';
import { Product, StockTransaction } from '../types/inventory';
import { recordStockOutNonSales } from '../services/inventoryService';
import { getTodayWIB, formatWIBDateDisplay } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/NotificationToast';
import {
  ArrowUpRight,
  Plus,
  Trash2,
  Search,
  FileText,
  AlertCircle,
  Eye,
  X,
  Package,
} from 'lucide-react';

interface StokKeluarNonPenjualanViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
}

interface NonSalesItemEntry {
  productId: string;
  qty: number;
}

export const StokKeluarNonPenjualanView: React.FC<StokKeluarNonPenjualanViewProps> = ({
  products,
  transactions,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [date, setDate] = useState<string>(getTodayWIB());
  const [soNumber, setSoNumber] = useState<string>('SO-');
  const [purpose, setPurpose] = useState<string>('Sample Produk');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [items, setItems] = useState<NonSalesItemEntry[]>([{ productId: '', qty: 1 }]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Search and filter history
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSoDetail, setSelectedSoDetail] = useState<{
    soNumber: string;
    date: string;
    notes: string;
    items: StockTransaction[];
  } | null>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  // Group non-sales transactions by SO Number
  const groupedSoRecords = useMemo(() => {
    const nonSales = transactions.filter((tx) => tx.type === 'KELUAR_NON_PENJUALAN');
    const map = new Map<string, { soNumber: string; date: string; notes: string; items: StockTransaction[] }>();

    nonSales.forEach((tx) => {
      const so = tx.referenceNo || 'NO-SO';
      if (!map.has(so)) {
        map.set(so, {
          soNumber: so,
          date: tx.date,
          notes: tx.notes || '',
          items: [],
        });
      }
      map.get(so)!.items.push(tx);
    });

    const list = Array.from(map.values());
    // Filter
    return list.filter((rec) => {
      const matchSo = rec.soNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchNotes = rec.notes.toLowerCase().includes(searchQuery.toLowerCase());
      const matchItems = rec.items.some((it) =>
        it.productName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return matchSo || matchNotes || matchItems;
    });
  }, [transactions, searchQuery]);

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
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk memproses pengeluaran non-penjualan.');
      openLoginModal();
      return;
    }

    if (!date) {
      showToast('error', 'Validasi Gagal', 'Tanggal transaksi wajib diisi.');
      return;
    }
    if (!soNumber.trim() || soNumber.trim() === 'SO-') {
      showToast('error', 'Validasi Gagal', 'Nomor SO wajib diisi (contoh: SO-00125).');
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

      // Check stock availability in state before network call
      const prod = products.find((p) => p.id === it.productId);
      if (prod && prod.currentStock < qty) {
        showToast(
          'error',
          'Stok Tidak Mencukupi',
          `Stok "${prod.name}" hanya tersedia ${prod.currentStock} unit (diminta ${qty}).`
        );
        return;
      }

      validItems.push({ productId: it.productId, qty: Math.round(qty) });
    }

    const fullNotes = customNotes ? `${purpose} - ${customNotes}` : purpose;

    try {
      setIsSubmitting(true);
      await recordStockOutNonSales(
        date,
        soNumber.trim(),
        validItems,
        fullNotes,
        user?.email || 'Staf Gudang'
      );

      const totalQty = validItems.reduce((acc, cur) => acc + cur.qty, 0);
      showToast(
        'success',
        'Pengeluaran Non-Penjualan Disimpan',
        `No SO "${soNumber.trim()}" berhasil diproses (-${totalQty} unit).`
      );

      // Reset
      setSoNumber('SO-');
      setItems([{ productId: '', qty: 1 }]);
      setCustomNotes('');
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Memproses Transaksi', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Stok Keluar Non-Penjualan</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pengeluaran fisik barang untuk sample, tester, kebutuhan internal kantor, promosi, atau penggantian barang
          </p>
        </div>
        <div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
            Terpisah dari Laporan Penjualan (Wajib No SO)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form (5 cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-purple-600" />
            <span>Form Pengeluaran Non-Penjualan</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
            {/* Tanggal & No SO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tanggal Keluar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor SO <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SO-00125"
                  value={soNumber}
                  onChange={(e) => setSoNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 font-mono text-slate-800 font-bold"
                />
              </div>
            </div>

            {/* Keperluan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Keperluan Pengeluaran <span className="text-rose-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              >
                <option value="Sample Produk">Sample Produk</option>
                <option value="Produk Tester">Produk Tester</option>
                <option value="Keperluan Internal Kantor">Keperluan Internal Kantor</option>
                <option value="Penggantian Barang Rusak/Hilang">Penggantian Barang (Retur/Garansi)</option>
                <option value="Keperluan Promosi / Event">Keperluan Promosi / Event</option>
                <option value="Lainnya">Keperluan Lainnya</option>
              </select>
            </div>

            {/* List Barang */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-slate-700">Item Barang & Kuantitas</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Barang
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {items.map((it, idx) => {
                  const selectedProd = products.find((p) => p.id === it.productId);
                  const isInsufficient = selectedProd && selectedProd.currentStock < (Number(it.qty) || 0);

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isInsufficient
                          ? 'bg-rose-50 border-rose-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
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
                                {p.name} (Tersedia: {p.currentStock})
                              </option>
                            ))}
                          </select>
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
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {selectedProd && (
                        <div className="flex justify-between items-center text-[10px] mt-1.5 text-slate-500">
                          <span>Stok Tersedia: <strong>{selectedProd.currentStock}</strong></span>
                          {isInsufficient ? (
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Stok Tidak Cukup!
                            </span>
                          ) : (
                            <span>
                              Sisa Nanti:{' '}
                              <strong className="text-purple-700">
                                {selectedProd.currentStock - (Number(it.qty) || 0)}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Keterangan Tambahan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Keterangan Tambahan / Penerima (Opsional)
              </label>
              <textarea
                rows={2}
                placeholder="Misal: Diberikan kepada Tim Marketing untuk pameran..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-xs transition-all disabled:opacity-50 text-xs"
            >
              {isSubmitting ? 'Memproses Transaksi...' : 'Konfirmasi Pengeluaran Non-Penjualan'}
            </button>
          </form>
        </div>

        {/* History of Non-Sales Grouped by SO (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Riwayat SO Non-Penjualan</h3>
              <p className="text-[11px] text-slate-500">
                Setiap nomor SO mencatat satu atau beberapa item barang keluar
              </p>
            </div>
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari No SO / Barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Nomor SO</th>
                  <th className="py-2.5 px-3">Keperluan / Keterangan</th>
                  <th className="py-2.5 px-3 text-center">Jumlah Item</th>
                  <th className="py-2.5 px-3 text-right">Total Qty Keluar</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {groupedSoRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Belum ada transaksi stok keluar non-penjualan.
                    </td>
                  </tr>
                ) : (
                  groupedSoRecords.map((rec) => {
                    const totalQty = rec.items.reduce((sum, it) => sum + it.qty, 0);
                    return (
                      <tr key={rec.soNumber} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                          {formatWIBDateDisplay(rec.date)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                          {rec.soNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate">
                          {rec.notes}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {rec.items.length} Barang
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          -{totalQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedSoDetail(rec)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 text-[11px] font-medium"
                          >
                            <Eye className="w-3.5 h-3.5" /> Detail
                          </button>
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

      {/* SO Detail Modal */}
      {selectedSoDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
                  Detail Transaksi Non-Penjualan
                </span>
                <h3 className="text-base font-bold text-slate-800">
                  {selectedSoDetail.soNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSoDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-slate-400 text-[10px]">Tanggal Keluar</p>
                  <p className="font-semibold text-slate-700">
                    {formatWIBDateDisplay(selectedSoDetail.date)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px]">Keperluan</p>
                  <p className="font-semibold text-slate-700">{selectedSoDetail.notes}</p>
                </div>
              </div>

              <h4 className="font-bold text-slate-700 pt-2">Rincian Barang yang Dikeluarkan:</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Nama Barang</th>
                      <th className="py-2 px-3 text-right">Qty Keluar</th>
                      <th className="py-2 px-3 text-right">Sisa Stok Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSoDetail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2 px-3 font-medium text-slate-800">{it.productName}</td>
                        <td className="py-2 px-3 text-right font-bold text-rose-600">
                          -{it.qty}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {it.balanceAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedSoDetail(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
