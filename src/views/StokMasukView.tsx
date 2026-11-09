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
} from 'lucide-react';

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

  const [date, setDate] = useState<string>(getTodayWIB());
  const [type, setType] = useState<'MASUK' | 'RETUR'>('MASUK');
  const [referenceNo, setReferenceNo] = useState<string>('');
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
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Update selected product if initialProductId changes
  React.useEffect(() => {
    if (initialProductId) {
      setItems([{ productId: initialProductId, qty: 10 }]);
      showToast('info', 'Barang Dipilih', 'Barang telah dipilih otomatis untuk pencatatan stok masuk');
    }
  }, [initialProductId]);

  // Filter history
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
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

  // History of stock in transactions
  const stockInHistory = useMemo(() => {
    return inTransactions
      .filter((tx) => {
        if (filterType === 'MASUK') return tx.type === 'MASUK';
        if (filterType === 'RETUR') return tx.type === 'RETUR';
        return true;
      })
      .filter((tx) => {
        const matchName = tx.productName.toLowerCase().includes(searchHistory.toLowerCase());
        const matchRef = (tx.referenceNo || '').toLowerCase().includes(searchHistory.toLowerCase());
        const matchDate = filterDate ? tx.date === filterDate : true;
        return (matchName || matchRef) && matchDate;
      });
  }, [inTransactions, searchHistory, filterDate, filterType]);

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
        user?.email || 'Staf Gudang'
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
        editType
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
                Tanggal Barang Diterima Kembali <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Riwayat Stok Masuk & Retur</h3>
                <p className="text-[11px] text-slate-500">
                  Semua catatan penambahan stok dan pengembalian barang tersimpan permanen
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari barang / ref..."
                  value={searchHistory}
                  onChange={(e) => setSearchHistory(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-36 focus:outline-hidden"
                />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                />
              </div>
            </div>

            {/* Quick Filter Tabs: All, Reguler, Retur */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-400 font-medium">Filter Tipe:</span>
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
                <span>Khusus Retur Konsumen ({returCount})</span>
                {totalReturQty > 0 && (
                  <span className="ml-1 text-[10px] px-1 rounded-sm bg-white/20">
                    +{totalReturQty} pcs
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Tipe</th>
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
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Belum ada transaksi stok masuk yang tercatat.
                    </td>
                  </tr>
                ) : (
                  stockInHistory.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
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
                  ))
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
    </div>
  );
};
