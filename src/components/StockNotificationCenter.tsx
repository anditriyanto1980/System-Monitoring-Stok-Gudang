import React, { useState, useMemo } from 'react';
import { Product } from '../types/inventory';
import { playStockAlertSound } from '../utils/audioAlert';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  Download,
  Volume2,
  VolumeX,
  X,
  Search,
  Package,
} from 'lucide-react';

interface StockNotificationCenterProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToRestock: (productId: string) => void;
}

export const StockNotificationCenter: React.FC<StockNotificationCenterProps> = ({
  products,
  isOpen,
  onClose,
  onNavigateToRestock,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'empty' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('warehouse_sound_alert_enabled') !== 'false';
  });

  const activeProducts = useMemo(() => {
    return products.filter((p) => p.isActive);
  }, [products]);

  // Out of stock (<= 0)
  const emptyStockItems = useMemo(() => {
    return activeProducts.filter((p) => p.currentStock <= 0);
  }, [activeProducts]);

  // Low stock (currentStock > 0 and <= minStock)
  const lowStockItems = useMemo(() => {
    return activeProducts.filter(
      (p) => p.currentStock > 0 && typeof p.minStock === 'number' && p.minStock > 0 && p.currentStock <= p.minStock
    );
  }, [activeProducts]);

  const allAlertItems = useMemo(() => {
    return [...emptyStockItems, ...lowStockItems];
  }, [emptyStockItems, lowStockItems]);

  const displayedItems = useMemo(() => {
    let list = allAlertItems;
    if (filterTab === 'empty') list = emptyStockItems;
    if (filterTab === 'low') list = lowStockItems;

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase().trim();
    return list.filter((item) => item.name.toLowerCase().includes(query));
  }, [allAlertItems, emptyStockItems, lowStockItems, filterTab, searchQuery]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('warehouse_sound_alert_enabled', String(next));
    if (next) {
      playStockAlertSound('warning');
    }
  };

  const handleTestSound = (type: 'warning' | 'critical') => {
    playStockAlertSound(type);
  };

  const handleExportRestockList = () => {
    if (allAlertItems.length === 0) return;

    const headers = ['ID Barang', 'Nama Barang', 'Stok Saat Ini', 'Batas Stok Minimum', 'Status Peringatan', 'Kebutuhan Minimal Restock'];
    const rows = allAlertItems.map((p) => {
      const isZero = p.currentStock <= 0;
      const min = p.minStock || 0;
      const need = Math.max(0, (min || 10) - p.currentStock);
      return [
        `"${p.id}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        p.currentStock,
        min,
        isZero ? '"HABIS (0 Unit)"' : '"MENIPIS / KRITIS"',
        need,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Kebutuhan_Restock_Gudang_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden mt-12 sm:mr-4 animate-in slide-in-from-top-4 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex items-center justify-between border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="relative p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
              <Bell className="w-5 h-5" />
              {allAlertItems.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
              )}
            </div>
            <div>
              <h2 id="notification-center-title" className="text-base font-bold text-white flex items-center gap-2">
                Pusat Peringatan & Sinyal Stok
              </h2>
              <p className="text-xs text-slate-300">
                Deteksi otomatis barang menipis dan habis secara real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            aria-label="Tutup notifikasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Audio Controls & Signal Status */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSound}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                soundEnabled
                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
              title="Aktifkan/nonaktifkan sinyal suara otomatis"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sinyal Suara: Aktif</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sinyal Suara: Mati</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleTestSound('critical')}
              className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
              title="Putar bunyi alarm darurat untuk barang habis"
            >
              Tes Alarm Kritis
            </button>
            <button
              onClick={() => handleTestSound('warning')}
              className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors"
              title="Putar denting lonceng untuk stok menipis"
            >
              Tes Chime Menipis
            </button>
          </div>

          {allAlertItems.length > 0 && (
            <button
              onClick={handleExportRestockList}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Ekspor Daftar Kebutuhan</span>
            </button>
          )}
        </div>

        {/* Status Metrics Bar */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-white border-b border-slate-100">
          <button
            onClick={() => setFilterTab('empty')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              filterTab === 'empty'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/30'
                : 'bg-slate-50 border-slate-200 hover:bg-rose-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                Stok Habis (0)
              </span>
              <span className="text-base font-extrabold text-rose-600">
                {emptyStockItems.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Prioritas darurat restock</p>
          </button>

          <button
            onClick={() => setFilterTab('low')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              filterTab === 'low'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/30'
                : 'bg-slate-50 border-slate-200 hover:bg-amber-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Stok Menipis
              </span>
              <span className="text-base font-extrabold text-amber-600">
                {lowStockItems.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Di bawah batas minimum</p>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 bg-slate-50/50 border-b border-slate-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama barang di peringatan..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setFilterTab('all')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterTab === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Semua ({allAlertItems.length})
          </button>
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
          {displayedItems.length === 0 ? (
            <div className="py-12 px-4 text-center">
              {allAlertItems.length === 0 ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 shadow-xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Semua Stok Gudang Aman!
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mt-1">
                    Tidak ada barang yang habis atau di bawah batas minimum persediaan saat ini.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-slate-400">
                  <Package className="w-8 h-8 mb-1 text-slate-300" />
                  <p className="text-xs">Tidak ada barang sesuai filter pencarian.</p>
                </div>
              )}
            </div>
          ) : (
            displayedItems.map((item) => {
              const isZero = item.currentStock <= 0;
              const min = item.minStock || 0;
              const ratio = min > 0 ? Math.min(100, Math.round((item.currentStock / min) * 100)) : 0;

              return (
                <div
                  key={item.id}
                  className="p-3 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isZero
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isZero ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Stok Habis (0)
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Kritis / Menipis
                          </>
                        )}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-800 truncate" title={item.name}>
                      {item.name}
                    </h4>

                    {/* Stock level info */}
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px]">Sisa Stok: </span>
                        <span
                          className={`font-black ${
                            isZero ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {item.currentStock.toLocaleString('id-ID')} unit
                        </span>
                      </div>
                      <div className="text-slate-300">|</div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Batas Min: </span>
                        <span className="font-semibold text-slate-700">
                          {min.toLocaleString('id-ID')} unit
                        </span>
                      </div>
                    </div>

                    {/* Progress bar visualizing stock vs minStock */}
                    {min > 0 && (
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isZero ? 'bg-rose-500 w-0' : 'bg-amber-500'
                          }`}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Restock Shortcut */}
                  <button
                    onClick={() => {
                      onNavigateToRestock(item.id);
                      onClose();
                    }}
                    className="self-end sm:self-center shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs transition-all touch-manipulation"
                    title="Buka form Stok Masuk untuk barang ini"
                  >
                    <span>Restock</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500">
          Sistem otomatis mengawasi batas stok minimum yang diatur pada menu Master Barang.
        </div>
      </div>
    </div>
  );
};
