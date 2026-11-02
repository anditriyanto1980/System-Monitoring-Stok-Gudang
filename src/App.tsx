import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './components/NotificationToast';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import {
  Product,
  StockTransaction,
  ProductMapping,
  ImportBatch,
  StockOpnameSession,
} from './types/inventory';
import {
  getAllProducts,
  getAllTransactions,
  getAllProductMappings,
  getAllImportBatches,
  getAllStockOpnames,
  createProductManual,
} from './services/inventoryService';

import { DashboardView } from './views/DashboardView';
import { MasterBarangView } from './views/MasterBarangView';
import { StokMasukView } from './views/StokMasukView';
import { StokKeluarNonPenjualanView } from './views/StokKeluarNonPenjualanView';
import { StokKeluarPenjualanView } from './views/StokKeluarPenjualanView';
import { StokKeluarMarketplaceView } from './views/StokKeluarMarketplaceView';
import { StokTerkiniView } from './views/StokTerkiniView';
import { StokOpnameView } from './views/StokOpnameView';
import { LaporanStokView } from './views/LaporanStokView';
import { PengaturanView } from './views/PengaturanView';
import { Loader2, RefreshCw } from 'lucide-react';

function WarehouseApp() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isOpenMobile, setIsOpenMobile] = useState<boolean>(false);

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [opnames, setOpnames] = useState<StockOpnameSession[]>([]);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Fetch all database records
  const loadData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const [pList, txList, mapList, batchList, opList] = await Promise.all([
        getAllProducts(),
        getAllTransactions(),
        getAllProductMappings(),
        getAllImportBatches(),
        getAllStockOpnames(),
      ]);

      setProducts(pList || []);
      setTransactions(txList || []);
      setMappings(mapList || []);
      setBatches(batchList || []);
      setOpnames(opList || []);
    } catch (err: any) {
      console.error('Error loading inventory data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Low stock counter for sidebar badge
  const lowStockCount = useMemo(() => {
    return products.filter(
      (p) => p.currentStock > 0 && p.minStock && p.currentStock <= p.minStock
    ).length;
  }, [products]);

  // Page titles
  const tabTitles: Record<NavTab, string> = {
    dashboard: 'Dashboard Utama',
    master: 'Master Data Barang',
    'stok-masuk': 'Stok Masuk & Retur',
    'keluar-non-penjualan': 'Stok Keluar Non-Penjualan',
    'keluar-penjualan': 'Stok Keluar Penjualan (Upload File)',
    'keluar-marketplace': 'Stok Keluar Marketplace (Shopee & TikTok)',
    'stok-terkini': 'Data Stok Terkini & Kartu Stok',
    'stok-opname': 'Stok Opname Gudang',
    laporan: 'Laporan Stok & Audit',
    pengaturan: 'Pengaturan & Pemetaan Alias',
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans">
      <div className="flex flex-1">
        {/* Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isOpenMobile={isOpenMobile}
          onCloseMobile={() => setIsOpenMobile(false)}
          lowStockCount={lowStockCount}
        />

        {/* Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            onToggleSidebar={() => setIsOpenMobile((prev) => !prev)}
            activeTabTitle={tabTitles[currentTab]}
          />

          <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
            {isLoadingData && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-sm font-medium">Memuat data persediaan gudang...</p>
              </div>
            ) : (
              <>
                {currentTab === 'dashboard' && (
                  <DashboardView
                    products={products}
                    transactions={transactions}
                    onNavigateTab={setCurrentTab}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'master' && (
                  <MasterBarangView products={products} onRefreshData={loadData} />
                )}

                {currentTab === 'stok-masuk' && (
                  <StokMasukView
                    products={products}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'keluar-non-penjualan' && (
                  <StokKeluarNonPenjualanView
                    products={products}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'keluar-penjualan' && (
                  <StokKeluarPenjualanView
                    products={products}
                    batches={batches}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'keluar-marketplace' && (
                  <StokKeluarMarketplaceView
                    products={products}
                    mappings={mappings}
                    batches={batches}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'stok-terkini' && (
                  <StokTerkiniView
                    products={products}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'stok-opname' && (
                  <StokOpnameView
                    products={products}
                    opnames={opnames}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'laporan' && (
                  <LaporanStokView
                    products={products}
                    transactions={transactions}
                    onRefreshData={loadData}
                  />
                )}

                {currentTab === 'pengaturan' && (
                  <PengaturanView
                    products={products}
                    mappings={mappings}
                    onRefreshData={loadData}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <WarehouseApp />
        <LoginModal />
      </ToastProvider>
    </AuthProvider>
  );
}
