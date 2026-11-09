import React, { useState, useMemo } from 'react';
import { Product, StockTransaction } from '../types/inventory';
import {
  recordStockOutNonSales,
  deleteStockOutNonSalesBySo,
  updateStockOutNonSalesBySo,
} from '../services/inventoryService';
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
  Edit3,
  Loader2,
  AlertTriangle,
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

  // Delete State
  const [soToDelete, setSoToDelete] = useState<{
    soNumber: string;
    date: string;
    notes: string;
    items: StockTransaction[];
  } | null>(null);
  const [isDeletingSo, setIsDeletingSo] = useState<boolean>(false);

  // Edit State
  const [soToEdit, setSoToEdit] = useState<{
    soNumber: string;
    date: string;
    notes: string;
    items: StockTransaction[];
  } | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editSoNumber, setEditSoNumber] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editItems, setEditItems] = useState<NonSalesItemEntry[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

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

  // Open Edit Modal
  const handleOpenEditModal = (rec: {
    soNumber: string;
    date: string;
    notes: string;
    items: StockTransaction[];
  }) => {
    setSoToEdit(rec);
    setEditDate(rec.date);
    setEditSoNumber(rec.soNumber);
    setEditNotes(rec.notes);
    setEditItems(
      rec.items.map((it) => ({
        productId: it.productId,
        qty: it.qty,
      }))
    );
  };

  const handleAddEditItem = () => {
    setEditItems((prev) => [...prev, { productId: '', qty: 1 }]);
  };

  const handleRemoveEditItem = (index: number) => {
    if (editItems.length === 1) return;
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = (index: number, field: 'productId' | 'qty', value: any) => {
    setEditItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!soToDelete) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google.');
      openLoginModal();
      return;
    }

    try {
      setIsDeletingSo(true);
      const totalRestored = await deleteStockOutNonSalesBySo(soToDelete.soNumber);
      await onRefreshData();
      showToast(
        'success',
        'Transaksi SO Berhasil Dihapus',
        `Transaksi ${soToDelete.soNumber} berhasil dihapus. Stok sebanyak ${totalRestored.toLocaleString()} unit telah dikembalikan ke saldo gudang.`
      );
      setSoToDelete(null);
      if (selectedSoDetail?.soNumber === soToDelete.soNumber) {
        setSelectedSoDetail(null);
      }
    } catch (err: any) {
      showToast('error', 'Gagal Menghapus Transaksi', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsDeletingSo(false);
    }
  };

  // Confirm Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soToEdit) return;
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google.');
      openLoginModal();
      return;
    }

    if (!editSoNumber.trim()) {
      showToast('error', 'Validasi Gagal', 'Nomor SO wajib diisi.');
      return;
    }
    if (!editDate) {
      showToast('error', 'Validasi Gagal', 'Tanggal transaksi wajib diisi.');
      return;
    }

    const validEditItems: { productId: string; qty: number }[] = [];
    for (let i = 0; i < editItems.length; i++) {
      const it = editItems[i];
      if (!it.productId) {
        showToast('error', 'Validasi Gagal', `Baris ${i + 1}: Silakan pilih barang.`);
        return;
      }
      if (!it.qty || it.qty <= 0) {
        showToast('error', 'Validasi Gagal', `Baris ${i + 1}: Qty harus lebih besar dari 0.`);
        return;
      }
      validEditItems.push({ productId: it.productId, qty: Number(it.qty) });
    }

    try {
      setIsSavingEdit(true);
      await updateStockOutNonSalesBySo(
        soToEdit.soNumber,
        editDate,
        editSoNumber.trim(),
        validEditItems,
        editNotes.trim(),
        user?.email || 'Staf Gudang'
      );
      await onRefreshData();
      showToast(
        'success',
        'Transaksi SO Berhasil Diperbarui',
        `Perubahan pada ${editSoNumber} berhasil disimpan dan penyesuaian stok gudang telah diperbarui otomatis.`
      );
      setSoToEdit(null);
      if (selectedSoDetail?.soNumber === soToEdit.soNumber) {
        setSelectedSoDetail(null);
      }
    } catch (err: any) {
      showToast('error', 'Gagal Memperbarui Transaksi', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSavingEdit(false);
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
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setSelectedSoDetail(rec)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-[11px] font-medium transition-colors"
                              title="Lihat Detail Transaksi"
                            >
                              <Eye className="w-3.5 h-3.5" /> Detail
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(rec)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-[11px] font-semibold transition-colors"
                              title="Edit Transaksi SO Ini"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => setSoToDelete(rec)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition-colors"
                              title="Hapus Transaksi SO Ini & Kembalikan Stok"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
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

      {/* SO Detail Modal */}
      {selectedSoDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
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

            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenEditModal(selectedSoDetail);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Transaksi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSoToDelete(selectedSoDetail);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              </div>

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

      {/* Delete Confirmation Modal */}
      {soToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <h3 className="text-base font-bold">Hapus Transaksi SO?</h3>
              </div>
              <button
                onClick={() => setSoToDelete(null)}
                disabled={isDeletingSo}
                className="p-1 rounded-lg text-rose-200 hover:text-white hover:bg-rose-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 space-y-2">
                <p className="font-bold text-sm text-rose-800">
                  Konfirmasi Pengembalian Stok Fisik Gudang
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>
                    Nomor SO: <strong className="font-mono text-purple-700">{soToDelete.soNumber}</strong>
                  </li>
                  <li>
                    Tanggal Transaksi: <strong>{formatWIBDateDisplay(soToDelete.date)}</strong>
                  </li>
                  <li>
                    Keperluan: <strong>{soToDelete.notes}</strong>
                  </li>
                  <li>
                    Total stok yang dikembalikan:{' '}
                    <strong className="text-emerald-700">
                      +{soToDelete.items.reduce((sum, it) => sum + it.qty, 0).toLocaleString()} Unit
                    </strong>
                  </li>
                </ul>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-slate-700">Barang yang akan dikembalikan:</span>
                <div className="max-h-24 overflow-y-auto space-y-1 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {soToDelete.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-800">{it.productName}</span>
                      <span className="font-bold text-emerald-600">+{it.qty} unit</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                Transaksi ini akan dihapus permanen dan seluruh jumlah barang yang dikeluarkan akan otomatis dikembalikan ke saldo gudang saat ini.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeletingSo}
                  onClick={() => setSoToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeletingSo}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingSo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengembalikan Stok...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Ya, Hapus & Kembalikan Stok</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {soToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Edit3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Edit Transaksi Non-Penjualan</h3>
                  <p className="text-xs text-blue-100">
                    Koreksi nomor SO, tanggal, keperluan, atau daftar barang
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSoToEdit(null)}
                disabled={isSavingEdit}
                className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Tanggal */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Nomor SO */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor SO / Surat Perintah <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editSoNumber}
                    onChange={(e) => setEditSoNumber(e.target.value)}
                    placeholder="Contoh: SO-001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-mono font-semibold focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Keperluan / Keterangan */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Keperluan / Keterangan Pengeluaran
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Contoh: Sample Produk - Tester Toko Cabang"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Items List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-700">Daftar Barang Keluar</label>
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {editItems.map((it, idx) => {
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
                            onChange={(e) => handleEditItemChange(idx, 'productId', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-hidden"
                          >
                            <option value="">-- Pilih Barang --</option>
                            {activeProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Stok Saat Ini: {p.currentStock})
                              </option>
                            ))}
                          </select>
                          {selectedProd && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Stok saat ini: {selectedProd.currentStock} unit
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
                              handleEditItemChange(idx, 'qty', Math.max(1, Number(e.target.value)))
                            }
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right text-rose-600 focus:outline-hidden"
                          />
                        </div>

                        {editItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(idx)}
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

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-800 leading-relaxed">
                ℹ️ <strong>Penyesuaian Otomatis:</strong> Sistem akan mengkalkulasi selisih kuantitas lama dan baru secara otomatis sehingga stok gudang Anda tetap akurat 100%.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setSoToEdit(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Simpan & Sesuaikan Stok</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
