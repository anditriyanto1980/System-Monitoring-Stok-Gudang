export type TransactionType =
  | 'SALDO_AWAL'
  | 'MASUK'
  | 'RETUR'
  | 'KELUAR_SHOPEE'
  | 'KELUAR_TIKTOK'
  | 'KELUAR_PENJUALAN'
  | 'KELUAR_NON_PENJUALAN'
  | 'PENYESUAIAN_OPNAME';

export type TransactionSource =
  | 'SALDO_AWAL'
  | 'PEMBELIAN'
  | 'RETUR'
  | 'SHOPEE'
  | 'TIKTOK'
  | 'PENJUALAN_LAIN'
  | 'NON_PENJUALAN'
  | 'OPNAME';

export interface Product {
  id: string;
  name: string;
  normalizedName: string;
  currentStock: number;
  minStock?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockTransaction {
  id: string;
  productId: string;
  productName: string;
  type: TransactionType;
  qty: number; // always positive magnitude
  direction: 'IN' | 'OUT' | 'ADJUST';
  balanceAfter: number;
  date: string; // YYYY-MM-DD
  referenceNo?: string; // SO number, Order ID, Batch ID, or Doc No
  consignmentNo?: string; // Nomor Consignment / Konsinyasi
  notes?: string;
  source: TransactionSource | string;
  batchId?: string;
  createdBy: string;
  createdAt: string; // ISO string
}

export interface ProductMapping {
  id: string;
  marketplace: 'SHOPEE' | 'TIKTOK';
  rawName: string;
  normalizedRawName: string;
  targetProductId: string;
  targetProductName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  platform: 'SHOPEE' | 'TIKTOK' | 'PENJUALAN' | 'PENJUALAN_LAIN' | 'MASTER';
  transactionDate: string;
  importedAt: string;
  itemCount: number;
  totalQty: number;
  status: 'SUCCESS' | 'FAILED';
  fileName: string;
  fileHash?: string;
  createdBy: string;
}

export interface StockOpnameItem {
  productId: string;
  productName: string;
  systemStock: number;
  physicalStock: number;
  difference: number; // physicalStock - systemStock
  notes?: string;
}

export interface StockOpnameSession {
  id: string;
  date: string;
  status: 'DRAFT' | 'CONFIRMED';
  createdBy: string;
  items: StockOpnameItem[];
  totalDifference: number;
  notes?: string;
  createdAt: string;
}

export interface ReportItemSummary {
  productId: string;
  productName: string;
  stokAwal: number;
  stokMasuk: number;
  keluarShopee: number;
  keluarTikTok: number;
  keluarPenjualanLain: number;
  keluarNonPenjualan: number;
  penyesuaian: number;
  stokAkhir: number;
}
