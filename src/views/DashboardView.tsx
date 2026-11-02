import React, { useState, useMemo } from 'react';
import {
  Product,
  StockTransaction,
} from '../types/inventory';
import {
  PeriodFilter,
  getDateRangeForPeriod,
  formatWIBDateDisplay,
  getTodayWIB,
} from '../utils/dateUtils';
import {
  Package,
  Layers,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  ShoppingBag,
  Calendar,
  Filter,
  CheckCircle2,
  RefreshCw,
  LogIn,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface DashboardViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onNavigateTab: (tab: any) => void;
  onRefreshData: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  transactions,
  onNavigateTab,
  onRefreshData,
}) => {
  const { user, openLoginModal } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>('TODAY');
  const [customStart, setCustomStart] = useState<string>(getTodayWIB());
  const [customEnd, setCustomEnd] = useState<string>(getTodayWIB());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const dateRange = useMemo(() => {
    return getDateRangeForPeriod(period, customStart, customEnd);
  }, [period, customStart, customEnd]);

  // Filter transactions within selected period
  const periodTransactions = useMemo(() => {
    return transactions.filter(
      (tx) => tx.date >= dateRange.startDate && tx.date <= dateRange.endDate
    );
  }, [transactions, dateRange]);

  // Overall Inventory Stats (Current Status)
  const totalSKU = products.length;
  const totalQuantity = products.reduce((sum, p) => sum + (p.currentStock || 0), 0);
  const outOfStockCount = products.filter((p) => p.currentStock <= 0).length;
  const lowStockCount = products.filter(
    (p) => p.currentStock > 0 && p.minStock && p.currentStock <= p.minStock
  ).length;

  // Period-based In/Out Movements
  const totalMasukPeriod = useMemo(() => {
    return periodTransactions
      .filter((tx) => tx.type === 'MASUK' || tx.type === 'RETUR')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [periodTransactions]);

  const totalShopeePeriod = useMemo(() => {
    return periodTransactions
      .filter((tx) => tx.type === 'KELUAR_SHOPEE')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [periodTransactions]);

  const totalTikTokPeriod = useMemo(() => {
    return periodTransactions
      .filter((tx) => tx.type === 'KELUAR_TIKTOK')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [periodTransactions]);

  const totalPenjualanLainPeriod = useMemo(() => {
    return periodTransactions
      .filter((tx) => tx.type === 'KELUAR_PENJUALAN')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [periodTransactions]);

  const totalPenjualanAllPeriod = totalShopeePeriod + totalTikTokPeriod + totalPenjualanLainPeriod;

  const totalNonPenjualanPeriod = useMemo(() => {
    return periodTransactions
      .filter((tx) => tx.type === 'KELUAR_NON_PENJUALAN')
      .reduce((sum, tx) => sum + tx.qty, 0);
  }, [periodTransactions]);

  // Filtered products for quick inventory table
  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Max value for movement comparison bar
  const maxMovement = Math.max(
    totalMasukPeriod,
    totalShopeePeriod,
    totalTikTokPeriod,
    totalPenjualanLainPeriod,
    totalNonPenjualanPeriod,
    1
  );

  return (
    <div className="space-y-6">
      {/* Unauthenticated Notification Banner for Multi-Device Users */}
      {!user && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Mode Penampil Gudang (View Only)
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Anda dapat memantau data stok secara bebas di semua perangkat (PC, Tablet, & HP). Untuk menambah barang, mencatat stok masuk/keluar, atau stok opname, silakan login dengan akun Google.
              </p>
            </div>
          </div>
          <button
            onClick={openLoginModal}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all shrink-0 active:scale-95 touch-manipulation min-h-[38px]"
          >
            <LogIn className="w-4 h-4" />
            <span>Login Akun Google</span>
          </button>
        </div>
      )}

      {/* Top Banner & Period Filter */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">Ringkasan Gudang</h2>
            <button
              onClick={onRefreshData}
              title="Perbarui Data"
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Periode aktif: <span className="font-semibold text-blue-600">{dateRange.label}</span>
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/60 text-xs">
          {[
            { id: 'TODAY' as PeriodFilter, label: 'Hari Ini' },
            { id: 'YESTERDAY' as PeriodFilter, label: 'Kemarin' },
            { id: 'THIS_WEEK' as PeriodFilter, label: 'Minggu Ini' },
            { id: 'THIS_MONTH' as PeriodFilter, label: 'Bulan Ini' },
            { id: 'THIS_YEAR' as PeriodFilter, label: 'Tahun Ini' },
            { id: 'CUSTOM' as PeriodFilter, label: 'Kustom' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                period === tab.id
                  ? 'bg-white text-blue-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker when CUSTOM selected */}
      {period === 'CUSTOM' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50/60 border border-blue-200 rounded-xl text-xs">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-medium text-slate-700">Pilih Rentang Tanggal:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
          />
          <span className="text-slate-400">s/d</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
          />
        </div>
      )}

      {/* Primary KPI Cards (7 Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total SKU */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Jenis Barang (SKU)</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalSKU.toLocaleString()}</h3>
            <button
              onClick={() => onNavigateTab('master')}
              className="text-[11px] text-blue-600 hover:underline mt-1 block font-medium"
            >
              Kelola Master Barang &rarr;
            </button>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* 2. Total Kuantitas Stok */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Kuantitas Fisik Gudang</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalQuantity.toLocaleString()}</h3>
            <span className="inline-block text-[11px] text-emerald-600 font-medium mt-1">
              Unit Aktif Tersedia
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* 3. Stok Habis (Nol) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Barang Stok Nol (Habis)</p>
            <h3 className={`text-2xl font-bold mt-1 ${outOfStockCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {outOfStockCount}
            </h3>
            <span className="text-[11px] text-slate-500 block mt-1">
              Perlu segera restock
            </span>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            outOfStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        {/* 4. Stok Menipis */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Barang Stok Menipis</p>
            <h3 className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {lowStockCount}
            </h3>
            <span className="text-[11px] text-slate-500 block mt-1">
              Di bawah batas minimum
            </span>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            lowStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Movement Cards for Selected Period (Stok Masuk, Keluar Penjualan, Keluar Non-Penjualan) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stok Masuk */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-85">
              Stok Masuk ({period === 'TODAY' ? 'Hari Ini' : 'Periode'})
            </span>
            <h4 className="text-3xl font-extrabold mt-1">+{totalMasukPeriod.toLocaleString()}</h4>
            <p className="text-xs opacity-90 mt-2">
              Penerimaan vendor & retur penjualan
            </p>
            <button
              onClick={() => onNavigateTab('stok-masuk')}
              className="mt-4 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium backdrop-blur-xs transition-colors inline-block"
            >
              Input Stok Masuk &rarr;
            </button>
          </div>
          <ArrowDownLeft className="absolute -right-2 -bottom-2 w-28 h-28 opacity-15 text-white" />
        </div>

        {/* Stok Keluar Penjualan (Total) */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-85">
              Keluar Penjualan ({period === 'TODAY' ? 'Hari Ini' : 'Periode'})
            </span>
            <h4 className="text-3xl font-extrabold mt-1">-{totalPenjualanAllPeriod.toLocaleString()}</h4>
            <p className="text-xs opacity-90 mt-2">
              Shopee, TikTok Shop, & penjualan lain
            </p>
            <button
              onClick={() => onNavigateTab('keluar-marketplace')}
              className="mt-4 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium backdrop-blur-xs transition-colors inline-block"
            >
              Upload Marketplace &rarr;
            </button>
          </div>
          <ShoppingBag className="absolute -right-2 -bottom-2 w-28 h-28 opacity-15 text-white" />
        </div>

        {/* Stok Keluar Non-Penjualan */}
        <div className="bg-gradient-to-br from-purple-600 to-slate-800 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-85">
              Keluar Non-Penjualan ({period === 'TODAY' ? 'Hari Ini' : 'Periode'})
            </span>
            <h4 className="text-3xl font-extrabold mt-1">-{totalNonPenjualanPeriod.toLocaleString()}</h4>
            <p className="text-xs opacity-90 mt-2">
              Sample, tester, internal & promosi (No SO)
            </p>
            <button
              onClick={() => onNavigateTab('keluar-non-penjualan')}
              className="mt-4 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium backdrop-blur-xs transition-colors inline-block"
            >
              Catat Non-Penjualan &rarr;
            </button>
          </div>
          <ArrowUpRight className="absolute -right-2 -bottom-2 w-28 h-28 opacity-15 text-white" />
        </div>
      </div>

      {/* Platform & Marketplace Breakdown Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Perbandingan Pengeluaran Stok Berdasarkan Platform
            </h3>
            <p className="text-xs text-slate-500">
              Rincian kuantitas keluar terpusat dari satu saldo persediaan gudang
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
            Total Keluar: {(totalPenjualanAllPeriod + totalNonPenjualanPeriod).toLocaleString()} Unit
          </span>
        </div>

        {/* 4 Platform Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Shopee */}
          <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-orange-800 uppercase tracking-wide">
                Shopee
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            </div>
            <p className="text-2xl font-extrabold text-orange-950">
              {totalShopeePeriod.toLocaleString()}
            </p>
            <p className="text-[11px] text-orange-700 mt-1">Unit Terjual</p>
          </div>

          {/* TikTok Shop */}
          <div className="p-4 rounded-xl border border-slate-800/20 bg-slate-900 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wide">
                TikTok Shop
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            </div>
            <p className="text-2xl font-extrabold text-white">
              {totalTikTokPeriod.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">Unit Terjual</p>
          </div>

          {/* Penjualan Lainnya */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                Penjualan Lainnya
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-2xl font-extrabold text-blue-950">
              {totalPenjualanLainPeriod.toLocaleString()}
            </p>
            <p className="text-[11px] text-blue-700 mt-1">Unit Terjual</p>
          </div>

          {/* Non-Penjualan */}
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">
                Non-Penjualan
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            </div>
            <p className="text-2xl font-extrabold text-purple-950">
              {totalNonPenjualanPeriod.toLocaleString()}
            </p>
            <p className="text-[11px] text-purple-700 mt-1">Sample / Internal</p>
          </div>
        </div>

        {/* Visual Movement Progress Bars */}
        <div className="space-y-3 pt-2">
          {/* Shopee Bar */}
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-700">Shopee</span>
              <span className="font-bold text-orange-600">{totalShopeePeriod} unit</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${(totalShopeePeriod / maxMovement) * 100}%` }}
              />
            </div>
          </div>

          {/* TikTok Shop Bar */}
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-700">TikTok Shop</span>
              <span className="font-bold text-slate-900">{totalTikTokPeriod} unit</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-800 rounded-full transition-all duration-500"
                style={{ width: `${(totalTikTokPeriod / maxMovement) * 100}%` }}
              />
            </div>
          </div>

          {/* Penjualan Lainnya Bar */}
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-700">Penjualan Lainnya</span>
              <span className="font-bold text-blue-600">{totalPenjualanLainPeriod} unit</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${(totalPenjualanLainPeriod / maxMovement) * 100}%` }}
              />
            </div>
          </div>

          {/* Non-Penjualan Bar */}
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-700">Non-Penjualan (Sample / Tester / Internal)</span>
              <span className="font-bold text-purple-600">{totalNonPenjualanPeriod} unit</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${(totalNonPenjualanPeriod / maxMovement) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Table: Barang dengan Stok Terkini */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Kondisi Stok Barang Terkini</h3>
            <p className="text-xs text-slate-500">
              Menampilkan {filteredProducts.length} dari {products.length} barang di master gudang
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Cari nama barang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-48 sm:w-64 focus:outline-hidden focus:border-blue-500"
            />
            <button
              onClick={() => onNavigateTab('stok-terkini')}
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-xl transition-colors whitespace-nowrap"
            >
              Lihat Semua Stok &rarr;
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">No</th>
                <th className="py-3 px-4">ID Barang</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4 text-right">Stok Fisik Saat Ini</th>
                <th className="py-3 px-4 text-center">Batas Minimum</th>
                <th className="py-3 px-4 text-center">Status Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Tidak ada barang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredProducts.slice(0, 8).map((p, idx) => {
                  let statusLabel = 'Tersedia';
                  let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                  if (p.currentStock <= 0) {
                    statusLabel = 'Habis';
                    statusBg = 'bg-rose-50 text-rose-700 border-rose-200';
                  } else if (p.minStock && p.currentStock <= p.minStock) {
                    statusLabel = 'Menipis';
                    statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                  }

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{p.id}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{p.name}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm">
                        {p.currentStock.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500">
                        {p.minStock ? p.minStock.toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBg}`}>
                          {statusLabel}
                        </span>
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
  );
};
