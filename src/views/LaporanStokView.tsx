import React, { useState, useMemo } from 'react';
import { Product, StockTransaction, ReportItemSummary, ImportBatch } from '../types/inventory';
import {
  PeriodFilter,
  getDateRangeForPeriod,
  formatWIBDateDisplay,
  formatWIBDateTimeDisplay,
  getTodayWIB,
} from '../utils/dateUtils';
import {
  exportToExcel,
  exportToCSV,
  exportReportToPDF,
} from '../utils/exportImport';
import {
  FileBarChart,
  Calendar,
  Download,
  Filter,
  Search,
  FileSpreadsheet,
  FileText,
  Printer,
  Boxes,
  Eye,
  ShoppingBag,
} from 'lucide-react';
import { BatchDetailModal } from '../components/BatchDetailModal';

interface LaporanStokViewProps {
  products: Product[];
  transactions: StockTransaction[];
  batches?: ImportBatch[];
  onRefreshData: () => Promise<void>;
}

export const LaporanStokView: React.FC<LaporanStokViewProps> = ({
  products,
  transactions,
  batches = [],
  onRefreshData,
}) => {
  const [period, setPeriod] = useState<PeriodFilter>('THIS_MONTH');
  const [customStart, setCustomStart] = useState<string>(getTodayWIB());
  const [customEnd, setCustomEnd] = useState<string>(getTodayWIB());
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'DETAIL' | 'BATCHES'>('SUMMARY');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('ALL');
  const [selectedBatchForDetail, setSelectedBatchForDetail] = useState<ImportBatch | null>(null);

  // Compute Active Date Range
  const dateRange = useMemo(() => {
    return getDateRangeForPeriod(period, customStart, customEnd);
  }, [period, customStart, customEnd]);

  // Compute Summary Report per Product based on date range
  const summaryReport: ReportItemSummary[] = useMemo(() => {
    // 1. Sort all transactions chronologically
    const sortedAll = [...transactions].sort((a, b) => {
      if (a.date === b.date) {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      return a.date.localeCompare(b.date);
    });

    const report: ReportItemSummary[] = [];

    products.forEach((p) => {
      const prodTx = sortedAll.filter((tx) => tx.productId === p.id);

      // A. Calculate Stok Awal (All transactions strictly before dateRange.startDate)
      let stokAwal = 0;
      const priorTx = prodTx.filter((tx) => tx.date < dateRange.startDate);

      for (const tx of priorTx) {
        if (tx.type === 'SALDO_AWAL' || tx.type === 'MASUK' || tx.type === 'RETUR') {
          stokAwal += tx.qty;
        } else if (
          tx.type === 'KELUAR_SHOPEE' ||
          tx.type === 'KELUAR_TIKTOK' ||
          tx.type === 'KELUAR_PENJUALAN' ||
          tx.type === 'KELUAR_NON_PENJUALAN'
        ) {
          stokAwal -= tx.qty;
        } else if (tx.type === 'PENYESUAIAN_OPNAME') {
          // If opname happened, balanceAfter resets the running balance
          stokAwal = tx.balanceAfter;
        }
      }

      // B. Transactions strictly within period [startDate, endDate]
      const periodTx = prodTx.filter(
        (tx) => tx.date >= dateRange.startDate && tx.date <= dateRange.endDate
      );

      let stokMasuk = 0;
      let keluarShopee = 0;
      let keluarTikTok = 0;
      let keluarPenjualanLain = 0;
      let keluarNonPenjualan = 0;
      let penyesuaian = 0;

      let runningInPeriod = stokAwal;

      for (const tx of periodTx) {
        if (tx.type === 'SALDO_AWAL' || tx.type === 'MASUK' || tx.type === 'RETUR') {
          stokMasuk += tx.qty;
          runningInPeriod += tx.qty;
        } else if (tx.type === 'KELUAR_SHOPEE') {
          keluarShopee += tx.qty;
          runningInPeriod -= tx.qty;
        } else if (tx.type === 'KELUAR_TIKTOK') {
          keluarTikTok += tx.qty;
          runningInPeriod -= tx.qty;
        } else if (tx.type === 'KELUAR_PENJUALAN') {
          keluarPenjualanLain += tx.qty;
          runningInPeriod -= tx.qty;
        } else if (tx.type === 'KELUAR_NON_PENJUALAN') {
          keluarNonPenjualan += tx.qty;
          runningInPeriod -= tx.qty;
        } else if (tx.type === 'PENYESUAIAN_OPNAME') {
          const delta = tx.balanceAfter - runningInPeriod;
          penyesuaian += delta;
          runningInPeriod = tx.balanceAfter;
        }
      }

      const stokAkhir =
        stokAwal +
        stokMasuk -
        keluarShopee -
        keluarTikTok -
        keluarPenjualanLain -
        keluarNonPenjualan +
        penyesuaian;

      report.push({
        productId: p.id,
        productName: p.name,
        stokAwal,
        stokMasuk,
        keluarShopee,
        keluarTikTok,
        keluarPenjualanLain,
        keluarNonPenjualan,
        penyesuaian,
        stokAkhir,
      });
    });

    return report;
  }, [products, transactions, dateRange]);

  // Filter Summary by search
  const filteredSummary = useMemo(() => {
    return summaryReport.filter((r) =>
      r.productName.toLowerCase().includes(search.toLowerCase())
    );
  }, [summaryReport, search]);

  // Detailed Transaction Audit Log in period
  const periodDetailTransactions = useMemo(() => {
    return transactions
      .filter((tx) => tx.date >= dateRange.startDate && tx.date <= dateRange.endDate)
      .filter((tx) => {
        if (marketplaceFilter === 'RETUR') return tx.type === 'RETUR';
        if (marketplaceFilter === 'MASUK') return tx.type === 'MASUK';
        if (marketplaceFilter === 'SHOPEE') return tx.type === 'KELUAR_SHOPEE';
        if (marketplaceFilter === 'TIKTOK') return tx.type === 'KELUAR_TIKTOK';
        if (marketplaceFilter === 'PENJUALAN_LAIN') return tx.type === 'KELUAR_PENJUALAN';
        if (marketplaceFilter === 'NON_PENJUALAN') return tx.type === 'KELUAR_NON_PENJUALAN';
        return true;
      })
      .filter((tx) => {
        const matchName = tx.productName.toLowerCase().includes(search.toLowerCase());
        const matchRef = (tx.referenceNo || '').toLowerCase().includes(search.toLowerCase());
        return matchName || matchRef;
      });
  }, [transactions, dateRange, marketplaceFilter, search]);

  // Totals for summary table
  const totals = useMemo(() => {
    return filteredSummary.reduce(
      (acc, cur) => ({
        stokAwal: acc.stokAwal + cur.stokAwal,
        stokMasuk: acc.stokMasuk + cur.stokMasuk,
        keluarShopee: acc.keluarShopee + cur.keluarShopee,
        keluarTikTok: acc.keluarTikTok + cur.keluarTikTok,
        keluarPenjualanLain: acc.keluarPenjualanLain + cur.keluarPenjualanLain,
        keluarNonPenjualan: acc.keluarNonPenjualan + cur.keluarNonPenjualan,
        penyesuaian: acc.penyesuaian + cur.penyesuaian,
        stokAkhir: acc.stokAkhir + cur.stokAkhir,
      }),
      {
        stokAwal: 0,
        stokMasuk: 0,
        keluarShopee: 0,
        keluarTikTok: 0,
        keluarPenjualanLain: 0,
        keluarNonPenjualan: 0,
        penyesuaian: 0,
        stokAkhir: 0,
      }
    );
  }, [filteredSummary]);

  // Export to Excel
  const handleExportExcel = () => {
    if (activeTab === 'SUMMARY') {
      const data = filteredSummary.map((r, i) => ({
        'No': i + 1,
        'Nama Barang': r.productName,
        'Stok Awal': r.stokAwal,
        'Stok Masuk': r.stokMasuk,
        'Shopee': r.keluarShopee,
        'TikTok Shop': r.keluarTikTok,
        'Penjualan Lainnya': r.keluarPenjualanLain,
        'Non-Penjualan': r.keluarNonPenjualan,
        'Penyesuaian Opname': r.penyesuaian,
        'Stok Akhir': r.stokAkhir,
      }));
      exportToExcel(data, 'RingkasanStok', `Laporan_Stok_${period}_${Date.now()}`);
    } else {
      const data = periodDetailTransactions.map((tx, i) => ({
        'No': i + 1,
        'Tanggal': formatWIBDateDisplay(tx.date),
        'Jenis Transaksi': tx.type,
        'Sumber': tx.source,
        'Nama Barang': tx.productName,
        'Qty Masuk': tx.direction === 'IN' ? tx.qty : 0,
        'Qty Keluar': tx.direction === 'OUT' ? tx.qty : 0,
        'Saldo Setelah': tx.balanceAfter,
        'No Dokumen / SO / Order': tx.referenceNo || '-',
        'Keterangan': tx.notes || '-',
      }));
      exportToExcel(data, 'DetailTransaksi', `Detail_Transaksi_${period}_${Date.now()}`);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (activeTab === 'SUMMARY') {
      const data = filteredSummary.map((r, i) => ({
        'No': i + 1,
        'Nama Barang': r.productName,
        'Stok Awal': r.stokAwal,
        'Stok Masuk': r.stokMasuk,
        'Shopee': r.keluarShopee,
        'TikTok Shop': r.keluarTikTok,
        'Penjualan Lainnya': r.keluarPenjualanLain,
        'Non-Penjualan': r.keluarNonPenjualan,
        'Penyesuaian Opname': r.penyesuaian,
        'Stok Akhir': r.stokAkhir,
      }));
      exportToCSV(data, `Laporan_Stok_${period}_${Date.now()}`);
    } else {
      const data = periodDetailTransactions.map((tx, i) => ({
        'No': i + 1,
        'Tanggal': formatWIBDateDisplay(tx.date),
        'Jenis Transaksi': tx.type,
        'Sumber': tx.source,
        'Nama Barang': tx.productName,
        'Qty Masuk': tx.direction === 'IN' ? tx.qty : 0,
        'Qty Keluar': tx.direction === 'OUT' ? tx.qty : 0,
        'Saldo Setelah': tx.balanceAfter,
        'No Referensi': tx.referenceNo || '-',
      }));
      exportToCSV(data, `Detail_Transaksi_${period}_${Date.now()}`);
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (activeTab === 'SUMMARY') {
      const headers = [
        'No',
        'Nama Barang',
        'Stok Awal',
        'Stok Masuk',
        'Shopee',
        'TikTok',
        'Penjualan Lain',
        'Non-Penjualan',
        'Penyesuaian',
        'Stok Akhir',
      ];
      const rows = filteredSummary.map((r, i) => [
        i + 1,
        r.productName,
        r.stokAwal,
        r.stokMasuk,
        r.keluarShopee,
        r.keluarTikTok,
        r.keluarPenjualanLain,
        r.keluarNonPenjualan,
        r.penyesuaian > 0 ? `+${r.penyesuaian}` : r.penyesuaian,
        r.stokAkhir,
      ]);

      // Add Total Row
      rows.push([
        '',
        'TOTAL GUDANG',
        totals.stokAwal,
        totals.stokMasuk,
        totals.keluarShopee,
        totals.keluarTikTok,
        totals.keluarPenjualanLain,
        totals.keluarNonPenjualan,
        totals.penyesuaian > 0 ? `+${totals.penyesuaian}` : totals.penyesuaian,
        totals.stokAkhir,
      ]);

      exportReportToPDF(
        'LAPORAN PERGERAKAN STOK GUDANG TERPUSAT',
        `Periode: ${dateRange.label} | Dicetak: ${formatWIBDateDisplay(getTodayWIB())}`,
        headers,
        rows,
        `Laporan_Stok_Gudang_${period}`
      );
    } else {
      const headers = [
        'No',
        'Tanggal',
        'Sumber',
        'Nama Barang',
        'Masuk',
        'Keluar',
        'Saldo',
        'No Ref / Catatan',
      ];
      const rows = periodDetailTransactions.map((tx, i) => [
        i + 1,
        formatWIBDateDisplay(tx.date),
        tx.source,
        tx.productName,
        tx.direction === 'IN' ? `+${tx.qty}` : '-',
        tx.direction === 'OUT' ? `-${tx.qty}` : '-',
        tx.balanceAfter,
        tx.referenceNo || tx.notes || '-',
      ]);

      exportReportToPDF(
        'DETAIL AUDIT TRANSAKSI STOK GUDANG',
        `Periode: ${dateRange.label} | Dicetak: ${formatWIBDateDisplay(getTodayWIB())}`,
        headers,
        rows,
        `Detail_Audit_Stok_${period}`
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Laporan Stok Gudang</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Laporan lengkap pergerakan persediaan: Saldo Awal + Masuk - Shopee - TikTok - Lainnya - Non-Penjualan + Penyesuaian = Stok Akhir
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak PDF</span>
          </button>
        </div>
      </div>

      {/* Period Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700">Periode Laporan:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            {[
              { id: 'TODAY' as PeriodFilter, label: 'Harian (Hari Ini)' },
              { id: 'THIS_WEEK' as PeriodFilter, label: 'Mingguan (Senin-Minggu)' },
              { id: 'THIS_MONTH' as PeriodFilter, label: 'Bulanan' },
              { id: 'THIS_YEAR' as PeriodFilter, label: 'Tahunan' },
              { id: 'CUSTOM' as PeriodFilter, label: 'Rentang Khusus' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  period === tab.id
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'CUSTOM' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="font-medium text-slate-600">Dari Tanggal:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
            />
            <span className="text-slate-400">s/d</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
            />
          </div>
        )}
      </div>

      {/* Tabs: Ringkasan Per Barang vs Detail Transaksi vs Riwayat Upload */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-4 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'SUMMARY'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Ringkasan Posisi Stok (Per Barang)
          </button>
          <button
            onClick={() => setActiveTab('DETAIL')}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'DETAIL'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Audit Detail Seluruh Transaksi ({periodDetailTransactions.length})
          </button>
          <button
            onClick={() => setActiveTab('BATCHES')}
            className={`pb-3 border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'BATCHES'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Riwayat File Upload ({batches.length})</span>
          </button>
        </div>

        {activeTab === 'DETAIL' && (
          <div className="flex items-center gap-2 pb-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={marketplaceFilter}
              onChange={(e) => setMarketplaceFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="ALL">Semua Jenis Transaksi</option>
              <option value="RETUR">Khusus Retur Penjualan (Kembali)</option>
              <option value="MASUK">Penerimaan Reguler Vendor</option>
              <option value="SHOPEE">Hanya Penjualan Shopee</option>
              <option value="TIKTOK">Hanya Penjualan TikTok Shop</option>
              <option value="PENJUALAN_LAIN">Penjualan Lainnya</option>
              <option value="NON_PENJUALAN">Non-Penjualan</option>
            </select>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Cari nama barang..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden"
        />
      </div>

      {/* TAB 1: SUMMARY REPORT TABLE */}
      {activeTab === 'SUMMARY' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">No</th>
                  <th className="py-3 px-4">Nama Barang</th>
                  <th className="py-3 px-3 text-right bg-slate-100/60">Stok Awal</th>
                  <th className="py-3 px-3 text-right text-emerald-700 bg-emerald-50/40">Masuk</th>
                  <th className="py-3 px-3 text-right text-orange-700 bg-orange-50/40">Shopee</th>
                  <th className="py-3 px-3 text-right text-slate-900 bg-slate-100/40">TikTok</th>
                  <th className="py-3 px-3 text-right text-blue-700 bg-blue-50/40">Lainnya</th>
                  <th className="py-3 px-3 text-right text-purple-700 bg-purple-50/40">Non-Penjualan</th>
                  <th className="py-3 px-3 text-center">Penyesuaian</th>
                  <th className="py-3 px-4 text-right bg-blue-50/80 font-bold text-blue-900">
                    Stok Akhir
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSummary.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      Tidak ada data untuk periode ini.
                    </td>
                  </tr>
                ) : (
                  filteredSummary.map((r, idx) => (
                    <tr key={r.productId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{r.productName}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 bg-slate-50/30">
                        {r.stokAwal.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600 bg-emerald-50/20">
                        +{r.stokMasuk.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-orange-600 bg-orange-50/20">
                        -{r.keluarShopee.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800 bg-slate-50/20">
                        -{r.keluarTikTok.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-blue-600 bg-blue-50/20">
                        -{r.keluarPenjualanLain.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-purple-600 bg-purple-50/20">
                        -{r.keluarNonPenjualan.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-center font-bold">
                        {r.penyesuaian === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : r.penyesuaian > 0 ? (
                          <span className="text-blue-600">+{r.penyesuaian}</span>
                        ) : (
                          <span className="text-rose-600">{r.penyesuaian}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-blue-900 text-sm bg-blue-50/40">
                        {r.stokAkhir.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Grand Total Footer */}
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800">
                <tr>
                  <td colSpan={2} className="py-3 px-4 uppercase text-slate-700">
                    Total Gudang Terpusat
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{totals.stokAwal.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">+{totals.stokMasuk.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-orange-700">-{totals.keluarShopee.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-slate-900">-{totals.keluarTikTok.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-blue-700">-{totals.keluarPenjualanLain.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-purple-700">-{totals.keluarNonPenjualan.toLocaleString()}</td>
                  <td className="py-3 px-3 text-center">
                    {totals.penyesuaian > 0 ? `+${totals.penyesuaian}` : totals.penyesuaian}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-900 text-sm bg-blue-100/60 font-black">
                    {totals.stokAkhir.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED AUDIT TRANSACTIONS */}
      {activeTab === 'DETAIL' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Tanggal</th>
                  <th className="py-3 px-3">Jenis Transaksi</th>
                  <th className="py-3 px-3">Sumber / Platform</th>
                  <th className="py-3 px-4">Nama Barang</th>
                  <th className="py-3 px-3 text-right">Qty Masuk</th>
                  <th className="py-3 px-3 text-right">Qty Keluar</th>
                  <th className="py-3 px-3 text-right">Saldo Sesudah</th>
                  <th className="py-3 px-3">No Ref / SO / Batch</th>
                  <th className="py-3 px-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {periodDetailTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Tidak ada transaksi dalam periode ini.
                    </td>
                  </tr>
                ) : (
                  periodDetailTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        {formatWIBDateDisplay(tx.date)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-semibold">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                            tx.type === 'RETUR'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : tx.type === 'MASUK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tx.type.startsWith('KELUAR')
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {tx.type === 'RETUR' ? 'RETUR KONSUMEN' : tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{tx.source}</span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{tx.productName}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        {tx.direction === 'IN' ? `+${tx.qty}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                        {tx.direction === 'OUT' ? `-${tx.qty}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {tx.balanceAfter.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {tx.batchId ? (
                          <button
                            type="button"
                            onClick={() => {
                              const bId = tx.batchId!;
                              const found = batches.find((b) => b.id === bId);
                              if (found) {
                                setSelectedBatchForDetail(found);
                              } else {
                                setSelectedBatchForDetail({
                                  id: bId,
                                  platform: (tx.source === 'TIKTOK'
                                    ? 'TIKTOK'
                                    : tx.source === 'SHOPEE'
                                    ? 'SHOPEE'
                                    : 'PENJUALAN_LAIN') as any,
                                  transactionDate: tx.date,
                                  importedAt: tx.createdAt || tx.date,
                                  itemCount: 1,
                                  totalQty: tx.qty,
                                  status: 'SUCCESS',
                                  fileName: bId,
                                  createdBy: tx.createdBy,
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-bold"
                            title="Klik untuk melihat seluruh rincian batch ini"
                          >
                            <Eye className="w-3 h-3 text-blue-500" />
                            <span>{tx.referenceNo || tx.batchId}</span>
                          </button>
                        ) : (
                          tx.referenceNo || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                        {tx.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RIWAYAT FILE UPLOAD (ALL BATCHES) */}
      {activeTab === 'BATCHES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Semua Riwayat File Upload & Batch Import
              </h3>
              <p className="text-[11px] text-slate-500">
                Klik pada Batch ID atau tombol &quot;Lihat Data&quot; untuk mengecek rincian pesanan dan barang yang terpotong
              </p>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Total {batches.length} batch tersimpan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Batch ID</th>
                  <th className="py-2.5 px-3">Platform</th>
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
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Belum ada riwayat batch file upload yang tercatat di sistem.
                    </td>
                  </tr>
                ) : (
                  batches
                    .filter((b) => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      return (
                        b.id.toLowerCase().includes(q) ||
                        b.fileName.toLowerCase().includes(q) ||
                        b.platform.toLowerCase().includes(q) ||
                        (b.createdBy || '').toLowerCase().includes(q)
                      );
                    })
                    .map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => setSelectedBatchForDetail(b)}
                            className="group inline-flex items-center gap-1.5 font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer transition-colors"
                            title="Klik untuk melihat rincian batch ini"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-500 group-hover:text-blue-700 shrink-0" />
                            <span>{b.id}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              b.platform === 'SHOPEE'
                                ? 'bg-orange-100 text-orange-800'
                                : b.platform === 'TIKTOK'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {b.platform}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {formatWIBDateDisplay(b.transactionDate)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {formatWIBDateTimeDisplay(b.importedAt)}
                        </td>
                        <td
                          className="py-2.5 px-3 font-medium text-slate-800 max-w-[180px] truncate"
                          title={b.fileName}
                        >
                          {b.fileName}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600">{b.itemCount} item</td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          -{b.totalQty.toLocaleString()}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate"
                          title={b.createdBy}
                        >
                          {b.createdBy}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedBatchForDetail(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors touch-manipulation cursor-pointer"
                            title="Lihat rincian data dan cek ulang pesanan"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                            <span>Lihat Data</span>
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Batch Detail Modal */}
      {selectedBatchForDetail && (
        <BatchDetailModal
          batch={selectedBatchForDetail}
          allTransactions={transactions}
          products={products}
          onClose={() => setSelectedBatchForDetail(null)}
        />
      )}
    </div>
  );
};
