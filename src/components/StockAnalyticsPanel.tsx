import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product, StockTransaction } from '../types/inventory';
import {
  getTodayWIB,
  formatWIBDateDisplay,
  subtractDaysWIB,
  diffDaysWIB,
} from '../utils/dateUtils';
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Download,
  Search,
  ArrowRight,
  Package,
  ShoppingBag,
  CheckCircle2,
} from 'lucide-react';

interface StockAnalyticsPanelProps {
  products: Product[];
  transactions: StockTransaction[];
  onNavigateToRestock?: (productId: string) => void;
}

type AnalyticsSubTab = 'TOP_SELLING' | 'DAYS_OF_INVENTORY' | 'DEAD_STOCK';
type SalesChannelFilter = 'ALL' | 'SHOPEE' | 'TIKTOK' | 'OTHER';
type TopWindowDays = 7 | 14 | 30 | 90 | 0; // 0 = All time
type DoiWindowDays = 7 | 14 | 30;
type DeadStockThreshold = 30 | 60 | 90;
type DoiUrgencyFilter = 'ALL' | 'CRITICAL' | 'RESTOCK_SOON' | 'WATCH' | 'SAFE';

interface TopProductRow {
  product: Product;
  shopeeQty: number;
  tiktokQty: number;
  otherQty: number;
  totalSalesQty: number;
  activeChannelQty: number;
  dailyAvg: number;
  sharePercent: number;
}

interface DoiRow {
  product: Product;
  salesInWindow: number;
  shopeeQty: number;
  tiktokQty: number;
  otherQty: number;
  dailyVelocity: number;
  daysRemaining: number;
  urgency: 'CRITICAL' | 'RESTOCK_SOON' | 'WATCH' | 'SAFE';
  forecastText: string;
}

interface DeadStockRow {
  product: Product;
  lastOutDate: string | null;
  lastInDate: string | null;
  baselineDate: string;
  daysIdle: number;
  neverSold: boolean;
  agingTier: '30_59' | '60_89' | '90_PLUS';
}

export const StockAnalyticsPanel: React.FC<StockAnalyticsPanelProps> = ({
  products,
  transactions,
  onNavigateToRestock,
}) => {
  const todayStr = useMemo(() => getTodayWIB(), []);

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<AnalyticsSubTab>('TOP_SELLING');

  // Top 10 controls
  const [channelFilter, setChannelFilter] = useState<SalesChannelFilter>('ALL');
  const [topWindowDays, setTopWindowDays] = useState<TopWindowDays>(30);

  // Days of Inventory (DOI) controls
  const [doiWindowDays, setDoiWindowDays] = useState<DoiWindowDays>(30);
  const [doiUrgencyFilter, setDoiUrgencyFilter] = useState<DoiUrgencyFilter>('ALL');
  const [doiSearch, setDoiSearch] = useState<string>('');

  // Dead Stock controls
  const [deadThreshold, setDeadThreshold] = useState<DeadStockThreshold>(30);
  const [deadActivityFilter, setDeadActivityFilter] = useState<'ALL' | 'NEVER_OUT' | 'HAD_OUT'>('ALL');
  const [deadSearch, setDeadSearch] = useState<string>('');

  const activeProducts = useMemo(() => {
    return products.filter((p) => p.isActive);
  }, [products]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // =========================================================================
  // 1. TOP 10 PRODUK TERLARIS PER CHANNEL (Shopee vs TikTok vs Penjualan Lain)
  // =========================================================================
  const topWindowInfo = useMemo(() => {
    if (topWindowDays === 0) {
      // Find earliest sales date or use 30 fallback for daily avg
      let earliestDate = todayStr;
      transactions.forEach((tx) => {
        if (
          tx.type === 'KELUAR_SHOPEE' ||
          tx.type === 'KELUAR_TIKTOK' ||
          tx.type === 'KELUAR_PENJUALAN'
        ) {
          if (tx.date && tx.date < earliestDate) earliestDate = tx.date;
        }
      });
      const span = Math.max(1, diffDaysWIB(earliestDate, todayStr) + 1);
      return { startDate: '0000-00-00', effectiveDays: span, label: 'Semua Waktu' };
    }
    const startDate = subtractDaysWIB(todayStr, topWindowDays - 1);
    return {
      startDate,
      effectiveDays: topWindowDays,
      label: `${topWindowDays} Hari Terakhir`,
    };
  }, [topWindowDays, todayStr, transactions]);

  const topSalesStats = useMemo(() => {
    const aggMap = new Map<
      string,
      { shopee: number; tiktok: number; other: number }
    >();

    let channelTotalShopee = 0;
    let channelTotalTiktok = 0;
    let channelTotalOther = 0;

    transactions.forEach((tx) => {
      if (tx.date < topWindowInfo.startDate || tx.date > todayStr) return;
      if (
        tx.type !== 'KELUAR_SHOPEE' &&
        tx.type !== 'KELUAR_TIKTOK' &&
        tx.type !== 'KELUAR_PENJUALAN'
      ) {
        return;
      }

      const curr = aggMap.get(tx.productId) || { shopee: 0, tiktok: 0, other: 0 };
      if (tx.type === 'KELUAR_SHOPEE') {
        curr.shopee += tx.qty;
        channelTotalShopee += tx.qty;
      } else if (tx.type === 'KELUAR_TIKTOK') {
        curr.tiktok += tx.qty;
        channelTotalTiktok += tx.qty;
      } else if (tx.type === 'KELUAR_PENJUALAN') {
        curr.other += tx.qty;
        channelTotalOther += tx.qty;
      }
      aggMap.set(tx.productId, curr);
    });

    const totalAllChannels = channelTotalShopee + channelTotalTiktok + channelTotalOther;
    const totalActiveChannel =
      channelFilter === 'SHOPEE'
        ? channelTotalShopee
        : channelFilter === 'TIKTOK'
        ? channelTotalTiktok
        : channelFilter === 'OTHER'
        ? channelTotalOther
        : totalAllChannels;

    const allRows: TopProductRow[] = [];
    aggMap.forEach((counts, productId) => {
      const prod = productMap.get(productId);
      if (!prod) return;
      const totalSalesQty = counts.shopee + counts.tiktok + counts.other;
      const activeChannelQty =
        channelFilter === 'SHOPEE'
          ? counts.shopee
          : channelFilter === 'TIKTOK'
          ? counts.tiktok
          : channelFilter === 'OTHER'
          ? counts.other
          : totalSalesQty;

      if (activeChannelQty <= 0) return;

      allRows.push({
        product: prod,
        shopeeQty: counts.shopee,
        tiktokQty: counts.tiktok,
        otherQty: counts.other,
        totalSalesQty,
        activeChannelQty,
        dailyAvg: activeChannelQty / topWindowInfo.effectiveDays,
        sharePercent: totalActiveChannel > 0 ? (activeChannelQty / totalActiveChannel) * 100 : 0,
      });
    });

    allRows.sort((a, b) => b.activeChannelQty - a.activeChannelQty);

    // Channel champions (regardless of active channelFilter)
    const allProductArray = Array.from(aggMap.entries())
      .map(([pid, c]) => ({ prod: productMap.get(pid), ...c }))
      .filter((x): x is { prod: Product; shopee: number; tiktok: number; other: number } => Boolean(x.prod));

    const topShopee = [...allProductArray]
      .filter((x) => x.shopee > 0)
      .sort((a, b) => b.shopee - a.shopee)[0] || null;
    const topTiktok = [...allProductArray]
      .filter((x) => x.tiktok > 0)
      .sort((a, b) => b.tiktok - a.tiktok)[0] || null;
    const topOther = [...allProductArray]
      .filter((x) => x.other > 0)
      .sort((a, b) => b.other - a.other)[0] || null;

    return {
      top10: allRows.slice(0, 10),
      totalRankedProducts: allRows.length,
      channelTotalShopee,
      channelTotalTiktok,
      channelTotalOther,
      totalAllChannels,
      totalActiveChannel,
      topShopee,
      topTiktok,
      topOther,
    };
  }, [transactions, topWindowInfo, todayStr, productMap, channelFilter]);

  // =========================================================================
  // 2. ESTIMASI HABIS STOK (DAYS OF INVENTORY)
  // =========================================================================
  const doiAllRows: DoiRow[] = useMemo(() => {
    const startDate = subtractDaysWIB(todayStr, doiWindowDays - 1);
    const salesByProduct = new Map<string, { total: number; shopee: number; tiktok: number; other: number }>();

    transactions.forEach((tx) => {
      if (tx.date < startDate || tx.date > todayStr) return;
      if (
        tx.type !== 'KELUAR_SHOPEE' &&
        tx.type !== 'KELUAR_TIKTOK' &&
        tx.type !== 'KELUAR_PENJUALAN'
      ) {
        return;
      }
      const entry = salesByProduct.get(tx.productId) || { total: 0, shopee: 0, tiktok: 0, other: 0 };
      entry.total += tx.qty;
      if (tx.type === 'KELUAR_SHOPEE') entry.shopee += tx.qty;
      else if (tx.type === 'KELUAR_TIKTOK') entry.tiktok += tx.qty;
      else if (tx.type === 'KELUAR_PENJUALAN') entry.other += tx.qty;
      salesByProduct.set(tx.productId, entry);
    });

    const rows: DoiRow[] = [];

    activeProducts.forEach((prod) => {
      const stats = salesByProduct.get(prod.id);
      if (!stats || stats.total <= 0) return;

      const dailyVelocity = stats.total / doiWindowDays;
      const stock = Math.max(0, prod.currentStock || 0);
      const daysRemaining = stock <= 0 ? 0 : stock / dailyVelocity;

      let urgency: DoiRow['urgency'] = 'SAFE';
      if (stock <= 0 || daysRemaining <= 3) {
        urgency = 'CRITICAL';
      } else if (daysRemaining <= 7) {
        urgency = 'RESTOCK_SOON';
      } else if (daysRemaining <= 14) {
        urgency = 'WATCH';
      }

      const roundedDays = Math.floor(daysRemaining);
      let forecastText = '';
      if (stock <= 0) {
        forecastText = `Stok habis (0 pcs) — terjual rata-rata ${dailyVelocity.toFixed(1)} pcs/hari`;
      } else if (daysRemaining < 1) {
        forecastText = `Stok tinggal ${stock.toLocaleString()} pcs — estimasi habis kurang dari 1 hari`;
      } else {
        forecastText = `Stok tinggal ${stock.toLocaleString()} pcs — estimasi habis dalam ${roundedDays} hari`;
      }

      rows.push({
        product: prod,
        salesInWindow: stats.total,
        shopeeQty: stats.shopee,
        tiktokQty: stats.tiktok,
        otherQty: stats.other,
        dailyVelocity,
        daysRemaining,
        urgency,
        forecastText,
      });
    });

    // Sort by most urgent (lowest daysRemaining first, then highest dailyVelocity)
    rows.sort((a, b) => {
      if (a.daysRemaining !== b.daysRemaining) {
        return a.daysRemaining - b.daysRemaining;
      }
      return b.dailyVelocity - a.dailyVelocity;
    });

    return rows;
  }, [activeProducts, transactions, doiWindowDays, todayStr]);

  const filteredDoiRows = useMemo(() => {
    return doiAllRows.filter((r) => {
      if (doiUrgencyFilter !== 'ALL' && r.urgency !== doiUrgencyFilter) return false;
      if (doiSearch.trim()) {
        const q = doiSearch.toLowerCase();
        if (
          !r.product.name.toLowerCase().includes(q) &&
          !r.product.id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [doiAllRows, doiUrgencyFilter, doiSearch]);

  const doiSummaryCounts = useMemo(() => {
    let critical = 0;
    let restockSoon = 0;
    let watch = 0;
    let safe = 0;
    doiAllRows.forEach((r) => {
      if (r.urgency === 'CRITICAL') critical++;
      else if (r.urgency === 'RESTOCK_SOON') restockSoon++;
      else if (r.urgency === 'WATCH') watch++;
      else safe++;
    });
    return { critical, restockSoon, watch, safe, urgentTotal: critical + restockSoon };
  }, [doiAllRows]);

  // =========================================================================
  // 3. DEAD STOCK ALERT (TIDAK ADA PERGERAKAN KELUAR 30 / 60 / 90 HARI)
  // =========================================================================
  const deadStockAllRows: DeadStockRow[] = useMemo(() => {
    const outMap = new Map<string, string>(); // latest outbound date
    const inMap = new Map<string, string>(); // latest inbound date
    const earliestMap = new Map<string, string>(); // earliest transaction date

    transactions.forEach((tx) => {
      if (!tx.date) return;
      const prevEarliest = earliestMap.get(tx.productId);
      if (!prevEarliest || tx.date < prevEarliest) {
        earliestMap.set(tx.productId, tx.date);
      }

      if (tx.direction === 'OUT') {
        const prevOut = outMap.get(tx.productId);
        if (!prevOut || tx.date > prevOut) {
          outMap.set(tx.productId, tx.date);
        }
      } else if (tx.direction === 'IN') {
        const prevIn = inMap.get(tx.productId);
        if (!prevIn || tx.date > prevIn) {
          inMap.set(tx.productId, tx.date);
        }
      }
    });

    const rows: DeadStockRow[] = [];

    activeProducts.forEach((prod) => {
      // Only active stock sitting in warehouse can be dead stock
      if ((prod.currentStock || 0) <= 0) return;

      const lastOutDate = outMap.get(prod.id) || null;
      const lastInDate = inMap.get(prod.id) || null;
      const createdDate = prod.createdAt ? prod.createdAt.split('T')[0] : todayStr;
      const earliestTx = earliestMap.get(prod.id);

      let baselineDate = createdDate;
      if (lastOutDate) {
        baselineDate = lastOutDate;
      } else if (earliestTx && earliestTx < createdDate) {
        baselineDate = earliestTx;
      }

      const daysIdle = Math.max(0, diffDaysWIB(baselineDate, todayStr));
      if (daysIdle < deadThreshold) return;

      let agingTier: DeadStockRow['agingTier'] = '30_59';
      if (daysIdle >= 90) agingTier = '90_PLUS';
      else if (daysIdle >= 60) agingTier = '60_89';

      rows.push({
        product: prod,
        lastOutDate,
        lastInDate,
        baselineDate,
        daysIdle,
        neverSold: !lastOutDate,
        agingTier,
      });
    });

    // Sort longest idle first, then largest stock qty
    rows.sort((a, b) => {
      if (b.daysIdle !== a.daysIdle) return b.daysIdle - a.daysIdle;
      return b.product.currentStock - a.product.currentStock;
    });

    return rows;
  }, [activeProducts, transactions, deadThreshold, todayStr]);

  const filteredDeadStockRows = useMemo(() => {
    return deadStockAllRows.filter((r) => {
      if (deadActivityFilter === 'NEVER_OUT' && !r.neverSold) return false;
      if (deadActivityFilter === 'HAD_OUT' && r.neverSold) return false;
      if (deadSearch.trim()) {
        const q = deadSearch.toLowerCase();
        if (
          !r.product.name.toLowerCase().includes(q) &&
          !r.product.id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [deadStockAllRows, deadActivityFilter, deadSearch]);

  const deadStockTotalUnits = useMemo(() => {
    return deadStockAllRows.reduce((sum, r) => sum + (r.product.currentStock || 0), 0);
  }, [deadStockAllRows]);

  // =========================================================================
  // 4. EXPORT MULTI-SHEET EXCEL
  // =========================================================================
  const handleExportAnalyticsExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Top 10 Terlaris
    const sheetTop = topSalesStats.top10.map((r, i) => ({
      Peringkat: i + 1,
      'ID Barang': r.product.id,
      'Nama Barang': r.product.name,
      'Channel Filter': channelFilter,
      'Periode Analitik': topWindowInfo.label,
      Shopee: r.shopeeQty,
      'TikTok Shop': r.tiktokQty,
      'Penjualan Lain': r.otherQty,
      'Total Terjual (Channel Dipilih)': r.activeChannelQty,
      'Rata-rata / Hari': Number(r.dailyAvg.toFixed(2)),
      'Porsi (%)': `${r.sharePercent.toFixed(1)}%`,
      'Sisa Stok Gudang': r.product.currentStock,
    }));
    const wsTop = XLSX.utils.json_to_sheet(
      sheetTop.length > 0 ? sheetTop : [{ Info: 'Tidak ada data penjualan pada periode ini' }]
    );
    XLSX.utils.book_append_sheet(wb, wsTop, 'Top 10 Terlaris');

    // Sheet 2: Estimasi Habis Stok
    const sheetDoi = filteredDoiRows.map((r, i) => ({
      No: i + 1,
      'ID Barang': r.product.id,
      'Nama Barang': r.product.name,
      [`Terjual (${doiWindowDays} Hari)`]: r.salesInWindow,
      'Rata-rata Harian': Number(r.dailyVelocity.toFixed(2)),
      'Stok Fisik Saat Ini': r.product.currentStock,
      'Estimasi Habis (Hari)': r.product.currentStock <= 0 ? 0 : Number(r.daysRemaining.toFixed(1)),
      Status:
        r.urgency === 'CRITICAL'
          ? 'KRITIS (<= 3 Hari)'
          : r.urgency === 'RESTOCK_SOON'
          ? 'SEGERA RESTOCK (<= 7 Hari)'
          : r.urgency === 'WATCH'
          ? 'WASPADA (<= 14 Hari)'
          : 'AMAN (> 14 Hari)',
      Ringkasan: r.forecastText,
    }));
    const wsDoi = XLSX.utils.json_to_sheet(
      sheetDoi.length > 0 ? sheetDoi : [{ Info: 'Tidak ada data prediksi stok' }]
    );
    XLSX.utils.book_append_sheet(wb, wsDoi, 'Estimasi Habis Stok');

    // Sheet 3: Dead Stock Alert
    const sheetDead = filteredDeadStockRows.map((r, i) => ({
      No: i + 1,
      'ID Barang': r.product.id,
      'Nama Barang': r.product.name,
      'Stok Menumpuk': r.product.currentStock,
      'Terakhir Keluar': r.lastOutDate ? formatWIBDateDisplay(r.lastOutDate) : 'Belum Pernah Keluar',
      'Masuk Terakhir': r.lastInDate ? formatWIBDateDisplay(r.lastInDate) : '-',
      'Lama Tidak Bergerak (Hari)': r.daysIdle,
      Kategori:
        r.agingTier === '90_PLUS'
          ? '90+ Hari (Dead Stock Berat)'
          : r.agingTier === '60_89'
          ? '60-89 Hari (Lambat)'
          : '30-59 Hari (Perlu Evaluasi)',
    }));
    const wsDead = XLSX.utils.json_to_sheet(
      sheetDead.length > 0 ? sheetDead : [{ Info: `Tidak ada barang dead stock >= ${deadThreshold} hari` }]
    );
    XLSX.utils.book_append_sheet(wb, wsDead, `Dead Stock ${deadThreshold}+ Hari`);

    XLSX.writeFile(wb, `Analitik_Stok_Fast_Dead_Stock_${todayStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header & Export */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">
            Analitik Fast-Moving, Prediksi Habis & Dead Stock
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Pemantauan produk terlaris per channel, estimasi hari habis stok (Days of Inventory), dan deteksi barang mengendap tanpa pergerakan keluar.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportAnalyticsExcel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Download Excel Analitik (3 Sheet)</span>
        </button>
      </div>

      {/* Summary Metrics Strip (Single-level elevation, tabular-nums, zero pills) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500">Produk Terlaris ({topWindowInfo.label})</p>
          <p className="text-sm font-bold text-slate-900 mt-1.5 truncate" title={topSalesStats.top10[0]?.product.name || '-'}>
            {topSalesStats.top10[0] ? topSalesStats.top10[0].product.name : 'Belum ada penjualan'}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {topSalesStats.top10[0]
              ? `${topSalesStats.top10[0].activeChannelQty.toLocaleString()} unit terjual`
              : '0 unit'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500">
            Perlu Restock Segera (≤ 7 Hari)
          </p>
          <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${doiSummaryCounts.urgentTotal > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {doiSummaryCounts.urgentTotal} SKU
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {doiSummaryCounts.critical} kritis (≤ 3 hari) · basis {doiWindowDays} hari
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500">
            Dead Stock ({deadThreshold}+ Hari Tanpa Keluar)
          </p>
          <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${deadStockAllRows.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {deadStockAllRows.length} SKU
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {deadStockTotalUnits.toLocaleString()} unit tertahan di gudang
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500">
            Total Penjualan ({topWindowInfo.label})
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {topSalesStats.totalAllChannels.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Shopee {topSalesStats.channelTotalShopee.toLocaleString()} · TikTok {topSalesStats.channelTotalTiktok.toLocaleString()} · Lain {topSalesStats.channelTotalOther.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Main Analytics Sub-Navigation Bar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 flex items-center gap-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('TOP_SELLING')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'TOP_SELLING'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Top 10 Produk Terlaris per Channel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('DAYS_OF_INVENTORY')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'DAYS_OF_INVENTORY'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Estimasi Habis Stok (Days of Inventory)</span>
            {doiSummaryCounts.urgentTotal > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-rose-600 font-bold">
                · {doiSummaryCounts.urgentTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('DEAD_STOCK')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'DEAD_STOCK'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Dead Stock Alert (30 / 60 / 90 Hari)</span>
            {deadStockAllRows.length > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-amber-600 font-bold">
                · {deadStockAllRows.length}
              </span>
            )}
          </button>
        </div>

        {/* =============================================================== */}
        {/* SUB-TAB 1: TOP 10 PRODUK TERLARIS PER CHANNEL                   */}
        {/* =============================================================== */}
        {activeSubTab === 'TOP_SELLING' && (
          <div>
            {/* Controls Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Channel Segmented Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                {[
                  { id: 'ALL' as SalesChannelFilter, label: 'Semua Channel' },
                  { id: 'SHOPEE' as SalesChannelFilter, label: 'Shopee' },
                  { id: 'TIKTOK' as SalesChannelFilter, label: 'TikTok Shop' },
                  { id: 'OTHER' as SalesChannelFilter, label: 'Penjualan Lain' },
                ].map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setChannelFilter(ch.id)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      channelFilter === ch.id
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>

              {/* Window Selector */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                {[
                  { days: 7 as TopWindowDays, label: '7 Hari' },
                  { days: 14 as TopWindowDays, label: '14 Hari' },
                  { days: 30 as TopWindowDays, label: '30 Hari' },
                  { days: 90 as TopWindowDays, label: '90 Hari' },
                  { days: 0 as TopWindowDays, label: 'Semua Waktu' },
                ].map((w) => (
                  <button
                    key={w.days}
                    type="button"
                    onClick={() => setTopWindowDays(w.days)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      topWindowDays === w.days
                        ? 'bg-white text-blue-700 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel Leaders Comparison Strip (Flat divided 3-col strip) */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/50">
              <div className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-orange-700">Juara Shopee</span>
                  <span className="font-mono tabular-nums">
                    Total {topSalesStats.channelTotalShopee.toLocaleString()} unit
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                  {topSalesStats.topShopee ? topSalesStats.topShopee.prod.name : 'Belum ada data Shopee'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                  {topSalesStats.topShopee
                    ? `${topSalesStats.topShopee.shopee.toLocaleString()} unit terjual`
                    : '0 unit'}
                </p>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">Juara TikTok Shop</span>
                  <span className="font-mono tabular-nums">
                    Total {topSalesStats.channelTotalTiktok.toLocaleString()} unit
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                  {topSalesStats.topTiktok ? topSalesStats.topTiktok.prod.name : 'Belum ada data TikTok'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                  {topSalesStats.topTiktok
                    ? `${topSalesStats.topTiktok.tiktok.toLocaleString()} unit terjual`
                    : '0 unit'}
                </p>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">Juara Penjualan Lain</span>
                  <span className="font-mono tabular-nums">
                    Total {topSalesStats.channelTotalOther.toLocaleString()} unit
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                  {topSalesStats.topOther ? topSalesStats.topOther.prod.name : 'Belum ada data penjualan lain'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                  {topSalesStats.topOther
                    ? `${topSalesStats.topOther.other.toLocaleString()} unit terjual`
                    : '0 unit'}
                </p>
              </div>
            </div>

            {/* Top 10 Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Rank</th>
                    <th className="py-3 px-4">Nama Barang</th>
                    <th className="py-3 px-4 text-right">Shopee</th>
                    <th className="py-3 px-4 text-right">TikTok</th>
                    <th className="py-3 px-4 text-right">Lainnya</th>
                    <th className="py-3 px-4 text-right">
                      {channelFilter === 'ALL'
                        ? 'Total Terjual'
                        : channelFilter === 'SHOPEE'
                        ? 'Terjual (Shopee)'
                        : channelFilter === 'TIKTOK'
                        ? 'Terjual (TikTok)'
                        : 'Terjual (Lainnya)'}
                    </th>
                    <th className="py-3 px-4 text-right">Rata-rata / Hari</th>
                    <th className="py-3 px-4 text-right">Sisa Stok</th>
                    <th className="py-3 px-4 w-40">Porsi Penjualan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {topSalesStats.top10.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-medium text-slate-600">
                          Belum ada transaksi penjualan pada channel & periode ini.
                        </p>
                        <p className="text-[11px] mt-0.5">
                          Upload laporan penjualan Shopee, TikTok, atau Penjualan Harian untuk melihat peringkat produk terlaris.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    topSalesStats.top10.map((row, idx) => {
                      const isLow =
                        row.product.currentStock <= 0 ||
                        (row.product.minStock && row.product.currentStock <= row.product.minStock);

                      return (
                        <tr key={row.product.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-center font-mono tabular-nums font-bold text-slate-500">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{row.product.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {row.product.id}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-orange-700">
                            {row.shopeeQty.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                            {row.tiktokQty.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-700">
                            {row.otherQty.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 text-sm">
                            {row.activeChannelQty.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {row.dailyAvg.toFixed(1)} / hr
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={`font-bold ${
                                row.product.currentStock <= 0
                                  ? 'text-rose-600'
                                  : isLow
                                  ? 'text-amber-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {row.product.currentStock.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    channelFilter === 'SHOPEE'
                                      ? 'bg-orange-500'
                                      : channelFilter === 'TIKTOK'
                                      ? 'bg-slate-800'
                                      : 'bg-blue-600'
                                  }`}
                                  style={{ width: `${Math.min(100, row.sharePercent)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono tabular-nums text-slate-600 w-10 text-right">
                                {row.sharePercent.toFixed(1)}%
                              </span>
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
        )}

        {/* =============================================================== */}
        {/* SUB-TAB 2: ESTIMASI HABIS STOK (DAYS OF INVENTORY)              */}
        {/* =============================================================== */}
        {activeSubTab === 'DAYS_OF_INVENTORY' && (
          <div>
            {/* Controls Bar */}
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Basis Penjualan Harian (7-30 hari) */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    Basis Rata-Rata Penjualan Harian:
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                    {([7, 14, 30] as DoiWindowDays[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDoiWindowDays(d)}
                        className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          doiWindowDays === d
                            ? 'bg-white text-blue-700 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {d} Hari Terakhir
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Cari nama barang / SKU..."
                    value={doiSearch}
                    onChange={(e) => setDoiSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-full sm:w-64 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Urgency Filter Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                  {[
                    { id: 'ALL' as DoiUrgencyFilter, label: `Semua (${doiAllRows.length})` },
                    { id: 'CRITICAL' as DoiUrgencyFilter, label: `Kritis ≤ 3 Hr (${doiSummaryCounts.critical})` },
                    { id: 'RESTOCK_SOON' as DoiUrgencyFilter, label: `Restock ≤ 7 Hr (${doiSummaryCounts.restockSoon})` },
                    { id: 'WATCH' as DoiUrgencyFilter, label: `Waspada ≤ 14 Hr (${doiSummaryCounts.watch})` },
                    { id: 'SAFE' as DoiUrgencyFilter, label: `Aman > 14 Hr (${doiSummaryCounts.safe})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDoiUrgencyFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        doiUrgencyFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  Rumus: Stok Saat Ini ÷ (Total Terjual {doiWindowDays} Hari ÷ {doiWindowDays})
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Nama Barang</th>
                    <th className="py-3 px-4 text-right">Terjual ({doiWindowDays} Hr)</th>
                    <th className="py-3 px-4 text-right">Rata-rata / Hari</th>
                    <th className="py-3 px-4 text-right">Stok Saat Ini</th>
                    <th className="py-3 px-4 text-right">Estimasi Habis</th>
                    <th className="py-3 px-4">Status & Peringatan</th>
                    {onNavigateToRestock && <th className="py-3 px-4 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDoiRows.length === 0 ? (
                    <tr>
                      <td colSpan={onNavigateToRestock ? 7 : 6} className="py-12 text-center text-slate-400">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-medium text-slate-600">
                          Tidak ada produk dengan filter estimasi stok ini.
                        </p>
                        <p className="text-[11px] mt-0.5">
                          Produk yang belum memiliki transaksi penjualan dalam {doiWindowDays} hari terakhir tidak dihitung ke dalam estimasi habis stok.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredDoiRows.map((row) => {
                      let statusText = 'Aman (> 14 Hari)';
                      let statusColor = 'text-emerald-700';

                      if (row.urgency === 'CRITICAL') {
                        statusText = row.product.currentStock <= 0 ? 'Stok Habis' : 'Kritis (≤ 3 Hari)';
                        statusColor = 'text-rose-600';
                      } else if (row.urgency === 'RESTOCK_SOON') {
                        statusText = 'Segera Restock (4–7 Hari)';
                        statusColor = 'text-amber-700';
                      } else if (row.urgency === 'WATCH') {
                        statusText = 'Waspada (8–14 Hari)';
                        statusColor = 'text-blue-700';
                      }

                      return (
                        <tr key={row.product.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{row.product.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              Shopee {row.shopeeQty} · TikTok {row.tiktokQty} · Lain {row.otherQty}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                            {row.salesInWindow.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {row.dailyVelocity.toFixed(1)} pcs/hr
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                            {row.product.currentStock.toLocaleString()} pcs
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                            <span className={statusColor}>
                              {row.product.currentStock <= 0
                                ? '0 hari'
                                : row.daysRemaining < 1
                                ? '< 1 hari'
                                : `${Math.floor(row.daysRemaining)} hari`}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <p className={`font-semibold ${statusColor}`}>{statusText}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{row.forecastText}</p>
                          </td>
                          {onNavigateToRestock && (
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => onNavigateToRestock(row.product.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                <span>Restock</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* SUB-TAB 3: DEAD STOCK ALERT (30 / 60 / 90 HARI)                 */}
        {/* =============================================================== */}
        {activeSubTab === 'DEAD_STOCK' && (
          <div>
            {/* Controls Bar */}
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Threshold Selector: 30, 60, 90 Hari */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    Tidak Ada Pergerakan Keluar Minimal:
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                    {([30, 60, 90] as DeadStockThreshold[]).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDeadThreshold(days)}
                        className={`px-3 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          deadThreshold === days
                            ? 'bg-white text-amber-700 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {days} Hari
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Cari barang dead stock..."
                    value={deadSearch}
                    onChange={(e) => setDeadSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-full sm:w-64 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Sub-filter & Summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                  {[
                    { id: 'ALL' as const, label: `Semua (${deadStockAllRows.length})` },
                    {
                      id: 'HAD_OUT' as const,
                      label: `Pernah Keluar Sebelumnya (${deadStockAllRows.filter((r) => !r.neverSold).length})`,
                    },
                    {
                      id: 'NEVER_OUT' as const,
                      label: `Belum Pernah Keluar (${deadStockAllRows.filter((r) => r.neverSold).length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDeadActivityFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        deadActivityFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  Hanya menampilkan barang aktif yang memiliki stok fisik &gt; 0 unit di gudang
                </p>
              </div>
            </div>

            {/* Dead Stock Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Barang</th>
                    <th className="py-3 px-4 text-right">Stok Menumpuk</th>
                    <th className="py-3 px-4">Pergerakan Keluar Terakhir</th>
                    <th className="py-3 px-4">Masuk Terakhir</th>
                    <th className="py-3 px-4 text-right">Lama Mengendap</th>
                    <th className="py-3 px-4">Status Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDeadStockRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-medium text-slate-600">
                          Tidak ditemukan dead stock selama ≥ {deadThreshold} hari.
                        </p>
                        <p className="text-[11px] mt-0.5">
                          Seluruh stok yang tersedia di gudang memiliki pergerakan keluar dalam {deadThreshold} hari terakhir.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredDeadStockRows.map((row, idx) => {
                      let agingLabel = '30–59 Hari (Perlu Promosi)';
                      let agingColor = 'text-amber-700';

                      if (row.agingTier === '90_PLUS') {
                        agingLabel = '90+ Hari (Dead Stock Berat)';
                        agingColor = 'text-rose-600';
                      } else if (row.agingTier === '60_89') {
                        agingLabel = '60–89 Hari (Slow Moving)';
                        agingColor = 'text-orange-700';
                      }

                      return (
                        <tr key={row.product.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{row.product.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {row.product.id}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                            {row.product.currentStock.toLocaleString()} pcs
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                            {row.lastOutDate
                              ? formatWIBDateDisplay(row.lastOutDate)
                              : `Belum pernah keluar (sejak ${formatWIBDateDisplay(row.baselineDate)})`}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                            {row.lastInDate ? formatWIBDateDisplay(row.lastInDate) : '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                            <span className={agingColor}>{row.daysIdle} hari</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-semibold ${agingColor}`}>{agingLabel}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
