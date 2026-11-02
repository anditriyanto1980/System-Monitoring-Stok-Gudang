import React, { useState, useEffect, useMemo } from 'react';
import { Product, StockOpnameSession, StockOpnameItem } from '../types/inventory';
import {
  saveStockOpnameDraft,
  confirmStockOpnameAdjustment,
  getAllStockOpnames,
} from '../services/inventoryService';
import { getTodayWIB, formatWIBDateDisplay, formatWIBDateTimeDisplay } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/NotificationToast';
import {
  ClipboardCheck,
  Search,
  Save,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
  X,
  RotateCcw,
  Calendar,
} from 'lucide-react';

interface StokOpnameViewProps {
  products: Product[];
  opnames: StockOpnameSession[];
  onRefreshData: () => Promise<void>;
}

export const StokOpnameView: React.FC<StokOpnameViewProps> = ({
  products,
  opnames,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const { showToast } = useToast();

  const [date, setDate] = useState<string>(getTodayWIB());
  const [notes, setNotes] = useState<string>('Stok Opname Rutin');
  const [search, setSearch] = useState<string>('');
  const [filterSelisihOnly, setFilterSelisihOnly] = useState<boolean>(false);

  // Map of physical counts by productId
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [selectedPastOpname, setSelectedPastOpname] = useState<StockOpnameSession | null>(null);

  // Initialize physical counts from products if empty
  useEffect(() => {
    setPhysicalCounts((prev) => {
      const initial: Record<string, number> = { ...prev };
      products.forEach((p) => {
        if (initial[p.id] === undefined) {
          initial[p.id] = p.currentStock; // default physical = system stock
        }
      });
      return initial;
    });
  }, [products]);

  // Load draft opname if any
  const handleLoadDraft = (session: StockOpnameSession) => {
    setActiveSessionId(session.id);
    setDate(session.date);
    setNotes(session.notes || '');

    const newCounts: Record<string, number> = {};
    const newNotes: Record<string, string> = {};

    session.items.forEach((it) => {
      newCounts[it.productId] = it.physicalStock;
      if (it.notes) newNotes[it.productId] = it.notes;
    });

    setPhysicalCounts((prev) => ({ ...prev, ...newCounts }));
    setItemNotes((prev) => ({ ...prev, ...newNotes }));
    showToast('info', 'Draft Dimuat', `Draft opname tanggal ${formatWIBDateDisplay(session.date)} telah dimuat.`);
  };

  // Compile items with computed differences
  const opnameItems: StockOpnameItem[] = useMemo(() => {
    return products.map((p) => {
      const physical = physicalCounts[p.id] !== undefined ? physicalCounts[p.id] : p.currentStock;
      const diff = physical - p.currentStock;
      return {
        productId: p.id,
        productName: p.name,
        systemStock: p.currentStock,
        physicalStock: physical,
        difference: diff,
        notes: itemNotes[p.id] || '',
      };
    });
  }, [products, physicalCounts, itemNotes]);

  // Filtered for table display
  const filteredItems = useMemo(() => {
    return opnameItems.filter((it) => {
      const matchSearch = it.productName.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterSelisihOnly) return it.difference !== 0;
      return true;
    });
  }, [opnameItems, search, filterSelisihOnly]);

  // Summary of differences
  const summary = useMemo(() => {
    let matched = 0;
    let surplus = 0;
    let deficit = 0;
    let totalDiff = 0;

    opnameItems.forEach((it) => {
      totalDiff += it.difference;
      if (it.difference === 0) matched++;
      else if (it.difference > 0) surplus++;
      else deficit++;
    });

    return { matched, surplus, deficit, totalDiff, totalItems: opnameItems.length };
  }, [opnameItems]);

  const handlePhysicalChange = (productId: string, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setPhysicalCounts((prev) => ({ ...prev, [productId]: num }));
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menyimpan draft opname.');
      openLoginModal();
      return;
    }
    try {
      setIsSubmitting(true);
      const id = await saveStockOpnameDraft(
        activeSessionId,
        date,
        opnameItems,
        notes,
        user.email || 'Staf Gudang'
      );
      setActiveSessionId(id);
      showToast('success', 'Draft Tersimpan', 'Data hitung fisik sementara berhasil disimpan.');
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menyimpan Draft', err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Adjustment
  const handleConfirmAdjustment = async () => {
    if (!user) {
      showToast('warning', 'Login Diperlukan', 'Silakan login dengan akun Google untuk menyesuaikan stok fisik.');
      openLoginModal();
      return;
    }
    try {
      setIsSubmitting(true);
      await confirmStockOpnameAdjustment(
        activeSessionId,
        date,
        opnameItems,
        notes,
        user.email || 'Staf Gudang'
      );
      showToast(
        'success',
        'Penyesuaian Stok Berhasil Dilakukan',
        'Semua selisih telah dicatat sebagai transaksi penyesuaian opname dan stok gudang kini telah sinkron dengan fisik.'
      );
      setShowReviewModal(false);
      setActiveSessionId('');
      await onRefreshData();
    } catch (err: any) {
      showToast('error', 'Gagal Menyesuaikan Stok', err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Stok Opname Gudang</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pencocokan kuantitas fisik gudang dengan stok sistem dan pembuatan transaksi penyesuaian atomik
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-slate-600" />
            <span>Simpan Draft</span>
          </button>
          <button
            onClick={() => setShowReviewModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Review & Konfirmasi Penyesuaian</span>
          </button>
        </div>
      </div>

      {/* Date & Note inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Tanggal Stok Opname</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-semibold text-slate-700 mb-1">Keterangan / Sesi Opname</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Stok Opname Awal Bulan November 2026..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <p className="text-[11px] text-slate-500 font-medium">Total Barang Dicek</p>
          <p className="text-xl font-bold text-slate-800 mt-0.5">{summary.totalItems} SKU</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <p className="text-[11px] text-emerald-700 font-medium">Stok Sesuai (Selisih 0)</p>
          <p className="text-xl font-bold text-emerald-800 mt-0.5">{summary.matched} SKU</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/30">
          <p className="text-[11px] text-blue-700 font-medium">Fisik Lebih Banyak (+)</p>
          <p className="text-xl font-bold text-blue-800 mt-0.5">{summary.surplus} SKU</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30">
          <p className="text-[11px] text-rose-700 font-medium">Fisik Kurang (-)</p>
          <p className="text-xl font-bold text-rose-800 mt-0.5">{summary.deficit} SKU</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama barang..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filterSelisihOnly}
              onChange={(e) => setFilterSelisihOnly(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Hanya tampilkan barang yang berselisih</span>
          </label>
        </div>
      </div>

      {/* Opname Count Input Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">No</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4 text-right">Stok Sistem Saat Ini</th>
                <th className="py-3 px-4 text-right w-36">Hitung Fisik Aktual</th>
                <th className="py-3 px-4 text-center">Selisih (Fisik - Sistem)</th>
                <th className="py-3 px-4">Catatan Perbedaan (Opsional)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Tidak ada barang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => {
                  let badge = (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      0 (Sesuai)
                    </span>
                  );

                  if (it.difference > 0) {
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        +{it.difference} (Lebih)
                      </span>
                    );
                  } else if (it.difference < 0) {
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        {it.difference} (Kurang)
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={it.productId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        it.difference !== 0 ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{it.productName}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800 text-sm">
                        {it.systemStock.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          min="0"
                          value={it.physicalStock}
                          onChange={(e) => handlePhysicalChange(it.productId, e.target.value)}
                          className="w-28 px-2.5 py-1.5 text-right font-extrabold text-slate-900 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:border-blue-500 shadow-2xs"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">{badge}</td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="Keterangan..."
                          value={it.notes}
                          onChange={(e) =>
                            setItemNotes((prev) => ({ ...prev, [it.productId]: e.target.value }))
                          }
                          className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700 focus:outline-hidden"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History of Past Opnames */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Riwayat Sesi Stok Opname</h3>
          </div>
          <span className="text-xs text-slate-500">
            Total {opnames.length} sesi opname tercatat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">ID Sesi</th>
                <th className="py-2.5 px-3">Tanggal Opname</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Keterangan</th>
                <th className="py-2.5 px-3 text-center">Total Selisih Net</th>
                <th className="py-2.5 px-3">Petugas</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {opnames.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Belum ada riwayat stok opname.
                  </td>
                </tr>
              ) : (
                opnames.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{sess.id}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {formatWIBDateDisplay(sess.date)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sess.status === 'CONFIRMED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sess.status === 'CONFIRMED' ? 'Disesuaikan' : 'Draft'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 max-w-[200px] truncate">
                      {sess.notes || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">
                      <span
                        className={
                          sess.totalDifference > 0
                            ? 'text-blue-600'
                            : sess.totalDifference < 0
                            ? 'text-rose-600'
                            : 'text-slate-600'
                        }
                      >
                        {sess.totalDifference > 0 ? `+${sess.totalDifference}` : sess.totalDifference} Unit
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{sess.createdBy}</td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      {sess.status === 'DRAFT' && (
                        <button
                          onClick={() => handleLoadDraft(sess)}
                          className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md text-[11px] font-semibold"
                        >
                          Lanjutkan Draft
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedPastOpname(sess)}
                        className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review & Confirm Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Konfirmasi Penyesuaian Stok Opname
                </h3>
                <p className="text-xs text-slate-500">
                  Tanggal Transaksi: {formatWIBDateDisplay(date)} | Petugas: {user?.email || 'Staf'}
                </p>
              </div>
              <button
                onClick={() => setShowReviewModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900 text-xs">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" /> Aturan Penyesuaian Stok:
                </p>
                <p className="text-[11px] mt-1 text-slate-600">
                  1. Riwayat stok terdahulu tidak akan dihapus atau diubah.<br />
                  2. Sistem akan membuat transaksi baru dengan tipe <strong>PENYESUAIAN_OPNAME</strong> untuk setiap barang yang memiliki selisih.<br />
                  3. Saldo fisik saat ini akan diperbarui persis sesuai dengan angka hitung fisik aktual.
                </p>
              </div>

              {/* Difference breakdown */}
              <h4 className="font-bold text-slate-800 pt-1">
                Barang yang Mengalami Penyesuaian ({summary.surplus + summary.deficit} SKU):
              </h4>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Nama Barang</th>
                      <th className="py-2 px-3 text-right">Stok Sistem</th>
                      <th className="py-2 px-3 text-right">Stok Fisik</th>
                      <th className="py-2 px-3 text-center">Selisih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {opnameItems
                      .filter((it) => it.difference !== 0)
                      .map((it) => (
                        <tr key={it.productId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">{it.productName}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">{it.systemStock}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{it.physicalStock}</td>
                          <td className="py-2 px-3 text-center font-bold">
                            <span
                              className={
                                it.difference > 0 ? 'text-blue-600' : 'text-rose-600'
                              }
                            >
                              {it.difference > 0 ? `+${it.difference}` : it.difference}
                            </span>
                          </td>
                        </tr>
                      ))}
                    {summary.surplus === 0 && summary.deficit === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          Semua stok fisik sama persis dengan stok sistem. Tidak ada selisih.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal / Edit Lagi
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmAdjustment}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Memproses Penyesuaian...' : 'Konfirmasi & Sinkronkan Stok'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Past Opname Detail Modal */}
      {selectedPastOpname && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  Detail Riwayat Opname
                </span>
                <h3 className="text-base font-bold text-slate-800">
                  {selectedPastOpname.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Tanggal: {formatWIBDateDisplay(selectedPastOpname.date)} | Petugas: {selectedPastOpname.createdBy}
                </p>
              </div>
              <button
                onClick={() => setSelectedPastOpname(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl text-slate-700">
                Keterangan: <strong>{selectedPastOpname.notes || '-'}</strong>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Nama Barang</th>
                      <th className="py-2 px-3 text-right">Stok Sistem</th>
                      <th className="py-2 px-3 text-right">Stok Fisik</th>
                      <th className="py-2 px-3 text-center">Selisih</th>
                      <th className="py-2 px-3">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPastOpname.items.map((it) => (
                      <tr key={it.productId} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-800">{it.productName}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{it.systemStock}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{it.physicalStock}</td>
                        <td className="py-2 px-3 text-center font-bold">
                          <span
                            className={
                              it.difference > 0
                                ? 'text-blue-600'
                                : it.difference < 0
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            }
                          >
                            {it.difference > 0 ? `+${it.difference}` : it.difference}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">{it.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => setSelectedPastOpname(null)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
