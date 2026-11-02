import React from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  UploadCloud,
  ShoppingBag,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  Settings,
  X,
  Warehouse,
  AlertTriangle,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'master'
  | 'stok-masuk'
  | 'keluar-non-penjualan'
  | 'keluar-penjualan'
  | 'keluar-marketplace'
  | 'stok-terkini'
  | 'stok-opname'
  | 'laporan'
  | 'pengaturan';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  lowStockCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  lowStockCount,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'master' as NavTab,
      label: 'Master Barang',
      icon: Package,
      badge: null,
    },
    {
      id: 'stok-masuk' as NavTab,
      label: 'Stok Masuk',
      icon: ArrowDownLeft,
      badge: null,
    },
    {
      id: 'keluar-non-penjualan' as NavTab,
      label: 'Stok Keluar Non-Penjualan',
      icon: ArrowUpRight,
      badge: null,
    },
    {
      id: 'keluar-penjualan' as NavTab,
      label: 'Stok Keluar Penjualan (Upload)',
      icon: UploadCloud,
      badge: null,
    },
    {
      id: 'keluar-marketplace' as NavTab,
      label: 'Stok Keluar Marketplace',
      icon: ShoppingBag,
      badge: 'Shopee & TikTok',
      badgeColor: 'bg-orange-100 text-orange-700',
    },
    {
      id: 'stok-terkini' as NavTab,
      label: 'Stok Terkini & Kartu Stok',
      icon: Boxes,
      badge: lowStockCount > 0 ? `${lowStockCount} Menipis` : null,
      badgeColor: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'stok-opname' as NavTab,
      label: 'Stok Opname',
      icon: ClipboardCheck,
      badge: null,
    },
    {
      id: 'laporan' as NavTab,
      label: 'Laporan Stok',
      icon: FileBarChart,
      badge: null,
    },
    {
      id: 'pengaturan' as NavTab,
      label: 'Pengaturan & Pemetaan Alias',
      icon: Settings,
      badge: null,
    },
  ];

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Sistem Gudang
              </span>
              <h2 className="text-base font-bold text-slate-800 leading-tight">
                Monitoring Stok
              </h2>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'
                  }`}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tracking-tight ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeColor || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info box */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 m-3 rounded-xl border">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="text-[11px] font-semibold text-slate-700">Persediaan Terpusat</p>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Semua transaksi marketplace & gudang langsung mengikat pada satu saldo master stok barang.
          </p>
        </div>
      </aside>
    </>
  );
};
