import React, { useState, useMemo } from 'react';
import { Product, StockTransaction } from '../types/inventory';
import { formatWIBDateDisplay, formatWIBDateTimeDisplay } from '../utils/dateUtils';
import { exportToExcel, exportToCSV } from '../utils/exportImport';
import {
  Boxes,
  Search,
  Filter,
  Download,
  Eye,
  FileSpreadsheet,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';

interface StokTerkiniViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onRefreshData: () => Promise<void>;
}

export const StokTerkiniView: React.FC<StokTerkiniViewProps> = ({
  products,
  transactions,
  onRefreshData,
}) => {
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'LOW' | 'EMPTY'>('ALL');
  const [sortBy, setSortBy] = useState<'NAME_ASC' | 'NAME_DESC' | 'STOCK_DESC' | 'STOCK_ASC'>('NAME_ASC');

  // Selected product for Kartu Stok modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [kartuStokSourceFilter, setKartuStokSourceFilter] = useState<string>('ALL');

  // Filtered & Sorted products
  const processedProducts = useMemo(() => {
    let list = products.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter === 'AVAILABLE') {
      list = list.filter((p) => p.currentStock > (p.minStock || 0));
    } else if (statusFilter === 'LOW') {
      list = list.filter((p) => p.currentStock > 0 && p.minStock && p.currentStock <= p.minStock);
    } else if (statusFilter === 'EMPTY') {
      list = list.filter((p) => p.currentStock <= 0);
    }

    list.sort((a, b) => {
      if (sortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      if (sortBy === 'NAME_DESC') return b.name.localeCompare(a.name);
      if (sortBy === 'STOCK_DESC') return b.currentStock - a.currentStock;
      if (sortBy === 'STOCK_ASC') return a.currentStock - b.currentStock;
      return 0;
    });

    return list;
  }, [products, search, statusFilter, sortBy]);

  // Export Current Stock to Excel/CSV
  const handleExportStock = (type: 'xlsx' | 'csv') => {
    const exportData = processedProducts.map((p, idx) => {
      let status = 'Tersedia';
      if (p.currentStock <= 0) status = 'Habis';
      else if (p.minStock && p.currentStock <= p.minStock) status = 'Menipis';

      return {
        'No': idx + 1,
        'ID Barang': p.id,
        'Nama Barang': p.name,
        'Stok Fisik Saat Ini': p.currentStock,
        'Batas Minimum': p.minStock || '-',
        'Status Stok': status,
        'Status Master': p.isActive ? 'Aktif' : 'Nonaktif',
      };
    });

    if (type === 'xlsx') {
      exportToExcel(exportData, 'StokTerkini', `Stok_Terkini_Gudang_${Date.now()}`);
    } else {
      exportToCSV(exportData, `Stok_Terkini_Gudang_${Date.now()}`);
    }
  };

  // Kartu Stok Ledger for Selected Product
  const kartuStokLedger = useMemo(() => {
    if (!selectedProduct) return [];

    // Filter transactions for this product
    const prodTx = transactions.filter((tx) => tx.productId === selectedProduct.id);

    // Sort chronologically ascending
    const sorted = [...prodTx].sort((a, b) => {
      if (a.date === b.date) {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      return a.date.localeCompare(b.date);
    });

    // Reconstruct ledger entries
    const ledger = sorted.map((tx) => {
      let qtyIn = '-';
      let qtyOut = '-';
      let sourceLabel = tx.source || tx.type;

      if (tx.type === 'SALDO_AWAL') {
        sourceLabel = 'Saldo Awal';
        qtyIn = String(tx.qty);
      } else if (tx.type === 'MASUK') {
        sourceLabel = 'Stok Masuk (Vendor)';
        qtyIn = String(tx.qty);
      } else if (tx.type === 'RETUR') {
        sourceLabel = 'Retur Penjualan (Kembali)';
        qtyIn = String(tx.qty);
      } else if (tx.type === 'KELUAR_SHOPEE') {
        sourceLabel = 'Penjualan Shopee';
        qtyOut = String(tx.qty);
      } else if (tx.type === 'KELUAR_TIKTOK') {
        sourceLabel = 'Penjualan TikTok Shop';
        qtyOut = String(tx.qty);
      } else if (tx.type === 'KELUAR_PENJUALAN') {
        sourceLabel = 'Penjualan Lainnya';
        qtyOut = String(tx.qty);
      } else if (tx.type === 'KELUAR_NON_PENJUALAN') {
        sourceLabel = 'Non-Penjualan (Sample/SO)';
        qtyOut = String(tx.qty);
      } else if (tx.type === 'PENYESUAIAN_OPNAME') {
        sourceLabel = 'Penyesuaian Opname';
      }

      return {
        ...tx,
        sourceLabel,
        qtyIn,
        qtyOut,
      };
    });

    if (kartuStokSourceFilter === 'ALL') return ledger;
    return ledger.filter((l) => l.type === kartuStokSourceFilter);
  }, [selectedProduct, transactions, kartuStokSourceFilter]);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Data Stok Terkini</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoring fisik kuantitas barang secara real-time dan kartu stok pergerakan persediaan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExportStock('xlsx')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => handleExportStock('csv')}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama barang..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-hidden text-slate-700"
          >
            <option value="ALL">Semua Kondisi Stok</option>
            <option value="AVAILABLE">Tersedia (Aman)</option>
            <option value="LOW">Stok Menipis (Batas Min)</option>
            <option value="EMPTY">Stok Habis (0)</option>
          </select>
        </div>

        <div>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-hidden text-slate-700"
          >
            <option value="NAME_ASC">Urutkan: Nama Barang (A - Z)</option>
            <option value="NAME_DESC">Urutkan: Nama Barang (Z - A)</option>
            <option value="STOCK_DESC">Urutkan: Stok Tertinggi</option>
            <option value="STOCK_ASC">Urutkan: Stok Terendah</option>
          </select>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">No</th>
                <th className="py-3 px-4">ID Barang</th>
                <th className="py-3 px-4">Nama Barang</th>
                <th className="py-3 px-4 text-right">Stok Fisik Saat Ini</th>
                <th className="py-3 px-4 text-center">Batas Minimum</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Kartu Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {processedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Boxes className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    Tidak ada data barang yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                processedProducts.map((p, idx) => {
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
                      <td className="py-3 px-4 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">
                        {p.currentStock.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500">
                        {p.minStock ? p.minStock.toLocaleString() : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBg}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedProduct(p);
                            setKartuStokSourceFilter('ALL');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Buka Kartu Stok</span>
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

      {/* Modal / Drawer: KARTU STOK (Stock Card) */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 my-8 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  Kartu Stok Barang (Stock Card Ledger)
                </span>
                <h3 className="text-lg font-bold text-slate-800">{selectedProduct.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>ID: <strong className="font-mono text-slate-700">{selectedProduct.id}</strong></span>
                  <span>&bull;</span>
                  <span>
                    Stok Fisik Saat Ini:{' '}
                    <strong className="text-slate-900 text-sm font-bold">
                      {selectedProduct.currentStock}
                    </strong>{' '}
                    unit
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Sumber */}
            <div className="py-3 flex items-center justify-between gap-3 text-xs border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Filter Transaksi:</span>
                <select
                  value={kartuStokSourceFilter}
                  onChange={(e) => setKartuStokSourceFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
                >
                  <option value="ALL">Semua Riwayat Sumber</option>
                  <option value="SALDO_AWAL">Saldo Awal</option>
                  <option value="MASUK">Stok Masuk (Vendor)</option>
                  <option value="RETUR">Retur Penjualan</option>
                  <option value="KELUAR_SHOPEE">Penjualan Shopee</option>
                  <option value="KELUAR_TIKTOK">Penjualan TikTok Shop</option>
                  <option value="KELUAR_PENJUALAN">Penjualan Lainnya</option>
                  <option value="KELUAR_NON_PENJUALAN">Non-Penjualan (Sample/SO)</option>
                  <option value="PENYESUAIAN_OPNAME">Penyesuaian Opname</option>
                </select>
              </div>

              <span className="text-slate-400 text-[11px]">
                Menampilkan {kartuStokLedger.length} pergerakan stok
              </span>
            </div>

            {/* Kartu Stok Ledger Table */}
            <div className="flex-1 overflow-y-auto mt-2 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Sumber Transaksi</th>
                    <th className="py-2.5 px-3 text-right">Masuk</th>
                    <th className="py-2.5 px-3 text-right">Keluar</th>
                    <th className="py-2.5 px-3 text-right">Saldo Berjalan</th>
                    <th className="py-2.5 px-3">Referensi / No SO / Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {kartuStokLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        Belum ada pergerakan stok untuk barang ini.
                      </td>
                    </tr>
                  ) : (
                    kartuStokLedger.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600">
                          {formatWIBDateDisplay(row.date)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-800">{row.sourceLabel}</span>
                          {row.notes && (
                            <span className="block text-[10px] text-slate-500 truncate max-w-xs">
                              {row.notes}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          {row.qtyIn !== '-' ? `+${row.qtyIn}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          {row.qtyOut !== '-' ? `-${row.qtyOut}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 bg-slate-50/50">
                          {row.balanceAfter.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {row.referenceNo || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 mt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
              >
                Tutup Kartu Stok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
