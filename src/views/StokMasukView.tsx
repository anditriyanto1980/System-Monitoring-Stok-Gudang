import React, { useState, useMemo } from 'react';
import { Product, StockTransaction } from '../types/inventory';
import { recordStockIn } from '../services/inventoryService';
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
} from 'lucide-react';

interface StokMasukViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
}

interface ItemEntry {
  productId: string;
  qty: number;
}

export const StokMasukView: React.FC<StokMasukViewProps> = ({
  products,
  transactions,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [date, setDate] = useState<string>(getTodayWIB());
  const [type, setType] = useState<'MASUK' | 'RETUR'>('MASUK');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<ItemEntry[]>([{ productId: '', qty: 1 }]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Filter history
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  // History of stock in transactions
  const stockInHistory = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === 'MASUK' || tx.type === 'RETUR')
      .filter((tx) => {
        const matchName = tx.productName.toLowerCase().includes(searchHistory.toLowerCase());
        const matchRef = (tx.referenceNo || '').toLowerCase().includes(searchHistory.toLowerCase());
        const matchDate = filterDate ? tx.date === filterDate : true;
        return (matchName || matchRef) && matchDate;
      });
  }, [transactions, searchHistory, filterDate]);

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
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            <span>Form Transaksi Stok Masuk</span>
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
            {/* Tipe Penerimaan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Jenis Penerimaan
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
                  Penerimaan Reguler
                </button>
                <button
                  type="button"
                  onClick={() => setType('RETUR')}
                  className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                    type === 'RETUR'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Retur Penjualan (Kembali)
                </button>
              </div>
            </div>

            {/* Tanggal Transaksi */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal Transaksi <span className="text-rose-500">*</span>
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
                Nomor Dokumen / PO / No Pesanan (Opsional)
              </label>
              <input
                type="text"
                placeholder={type === 'RETUR' ? 'Contoh: RET-ORD-9982' : 'Contoh: PO-2026-001'}
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
                Catatan / Keterangan (Opsional)
              </label>
              <textarea
                rows={2}
                placeholder="Keterangan tambahan..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-all disabled:opacity-50 text-xs"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi Stok Masuk'}
            </button>
          </form>
        </div>

        {/* History Table (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Riwayat Stok Masuk</h3>
              <p className="text-[11px] text-slate-500">
                Semua catatan penambahan stok tersimpan permanen
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {stockInHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
