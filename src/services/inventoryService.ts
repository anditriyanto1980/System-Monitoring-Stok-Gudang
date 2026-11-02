import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Product,
  StockTransaction,
  ProductMapping,
  ImportBatch,
  StockOpnameSession,
  TransactionType,
  TransactionSource,
  StockOpnameItem,
} from '../types/inventory';
import { getTodayWIB } from '../utils/dateUtils';

// Helper to normalize strings for comparison (removes multiple spaces, trims, lowercases)
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Generate human-friendly unique IDs
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}-${randomStr}`.toUpperCase();
}

/**
 * -------------------------------------------------------------
 * PRODUCTS / MASTER BARANG
 * -------------------------------------------------------------
 */

export async function getAllProducts(): Promise<Product[]> {
  try {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Product);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
  }
}

export async function createProductManual(
  name: string,
  openingStock: number = 0,
  minStock: number = 0,
  userEmail: string = 'Staff'
): Promise<Product> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const normName = normalizeText(cleanName);

  if (!cleanName) {
    throw new Error('Nama barang tidak boleh kosong.');
  }

  // Check duplicate
  const all = await getAllProducts();
  const duplicate = all.find(p => p.normalizedName === normName);
  if (duplicate) {
    throw new Error(`Barang dengan nama "${cleanName}" sudah terdaftar dalam sistem.`);
  }

  const productId = generateId('PRD');
  const now = new Date().toISOString();
  const today = getTodayWIB();

  const newProduct: Product = {
    id: productId,
    name: cleanName,
    normalizedName: normName,
    currentStock: Math.max(0, openingStock),
    minStock: Math.max(0, minStock),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await runTransaction(db, async (txn) => {
      const prodRef = doc(db, 'products', productId);
      txn.set(prodRef, newProduct);

      // Record opening balance transaction if > 0
      if (openingStock > 0) {
        const txId = generateId('TX-INIT');
        const txDoc: StockTransaction = {
          id: txId,
          productId,
          productName: cleanName,
          type: 'SALDO_AWAL',
          qty: openingStock,
          direction: 'IN',
          balanceAfter: openingStock,
          date: today,
          referenceNo: 'SALDO-AWAL',
          notes: 'Saldo awal master barang',
          source: 'SALDO_AWAL',
          createdBy: userEmail,
          createdAt: now,
        };
        const txRef = doc(db, 'transactions', txId);
        txn.set(txRef, txDoc);
      }
    });

    return newProduct;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${productId}`);
  }
}

export async function updateProduct(
  productId: string,
  name: string,
  minStock?: number,
  isActive?: boolean
): Promise<void> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const normName = normalizeText(cleanName);

  const prodRef = doc(db, 'products', productId);
  try {
    const snap = await getDoc(prodRef);
    if (!snap.exists()) throw new Error('Barang tidak ditemukan.');

    const data = snap.data() as Product;
    // Check duplicate if name changed
    if (cleanName && normName !== data.normalizedName) {
      const all = await getAllProducts();
      const duplicate = all.find(p => p.id !== productId && p.normalizedName === normName);
      if (duplicate) {
        throw new Error(`Nama barang "${cleanName}" sudah digunakan oleh barang lain.`);
      }
    }

    const updates: Partial<Product> = {
      name: cleanName || data.name,
      normalizedName: cleanName ? normName : data.normalizedName,
      updatedAt: new Date().toISOString(),
    };
    if (typeof minStock === 'number') updates.minStock = Math.max(0, minStock);
    if (typeof isActive === 'boolean') updates.isActive = isActive;

    await updateDoc(prodRef, updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
  }
}

/**
 * Delete a single product and associated records
 */
export async function deleteProduct(productId: string): Promise<void> {
  return deleteMultipleProducts([productId]);
}

/**
 * Delete multiple products and their related transactions & mappings
 */
export async function deleteMultipleProducts(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;

  try {
    const idSet = new Set(productIds);

    // Fetch transactions and mappings to clean up related records
    const [allTx, allMappings] = await Promise.all([
      getAllTransactions(),
      getAllProductMappings(),
    ]);

    const txToDelete = (allTx || []).filter(t => idSet.has(t.productId));
    const mapToDelete = (allMappings || []).filter(m => idSet.has(m.targetProductId));

    const ops: Array<{ ref: any }> = [];

    // Products
    for (const pid of productIds) {
      ops.push({ ref: doc(db, 'products', pid) });
    }
    // Transactions
    for (const tx of txToDelete) {
      ops.push({ ref: doc(db, 'transactions', tx.id) });
    }
    // Mappings
    for (const m of mapToDelete) {
      ops.push({ ref: doc(db, 'product_mappings', m.id) });
    }

    // Chunk deletes into batches of 400 (Firestore limit is 500)
    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.delete(op.ref);
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'products');
  }
}

/**
 * Delete all products and their associated transactions from the database
 */
export async function deleteAllProducts(): Promise<void> {
  const allProducts = await getAllProducts();
  const allIds = (allProducts || []).map(p => p.id);
  if (allIds.length === 0) return;
  await deleteMultipleProducts(allIds);
}


/**
 * Bulk upload master items with opening balance
 */
export async function bulkUploadMasterProducts(
  items: { name: string; qty: number }[],
  skipDuplicates: boolean,
  userEmail: string
): Promise<{ success: number; skipped: number; failed: number; errors: string[] }> {
  const existing = await getAllProducts();
  const existingMap = new Map<string, Product>();
  existing.forEach(p => existingMap.set(p.normalizedName, p));

  let success = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  const now = new Date().toISOString();
  const today = getTodayWIB();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cleanName = item.name.trim().replace(/\s+/g, ' ');
    const norm = normalizeText(cleanName);

    if (!cleanName) {
      failed++;
      errors.push(`Baris ${i + 1}: Nama barang kosong.`);
      continue;
    }

    if (existingMap.has(norm)) {
      if (skipDuplicates) {
        skipped++;
      } else {
        failed++;
        errors.push(`Baris ${i + 1}: "${cleanName}" sudah ada di database.`);
      }
      continue;
    }

    const qty = Math.max(0, item.qty || 0);
    const productId = generateId('PRD');

    try {
      await runTransaction(db, async (txn) => {
        const prodDoc: Product = {
          id: productId,
          name: cleanName,
          normalizedName: norm,
          currentStock: qty,
          minStock: 0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        const prodRef = doc(db, 'products', productId);
        txn.set(prodRef, prodDoc);

        if (qty > 0) {
          const txId = generateId('TX-INIT');
          const txDoc: StockTransaction = {
            id: txId,
            productId,
            productName: cleanName,
            type: 'SALDO_AWAL',
            qty,
            direction: 'IN',
            balanceAfter: qty,
            date: today,
            referenceNo: 'SALDO-AWAL-IMPORT',
            notes: 'Saldo awal dari import master file',
            source: 'SALDO_AWAL',
            createdBy: userEmail,
            createdAt: now,
          };
          const txRef = doc(db, 'transactions', txId);
          txn.set(txRef, txDoc);
        }
      });

      // Add to local map to avoid duplicate in the same file
      existingMap.set(norm, {
        id: productId,
        name: cleanName,
        normalizedName: norm,
        currentStock: qty,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      success++;
    } catch (err: any) {
      failed++;
      errors.push(`Baris ${i + 1}: Gagal menyimpan "${cleanName}" (${err?.message || 'Error'})`);
    }
  }

  return { success, skipped, failed, errors };
}

/**
 * -------------------------------------------------------------
 * STOCK TRANSACTIONS
 * -------------------------------------------------------------
 */

export async function getAllTransactions(): Promise<StockTransaction[]> {
  try {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as StockTransaction);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transactions');
  }
}

/**
 * Record Stock In (Pembelian / Penerimaan atau Retur)
 */
export async function recordStockIn(
  items: { productId: string; qty: number }[],
  date: string,
  type: 'MASUK' | 'RETUR',
  referenceNo: string = '',
  notes: string = '',
  userEmail: string
): Promise<void> {
  if (items.length === 0) throw new Error('Tidak ada barang yang dipilih.');
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (txn) => {
      // 1. Read all products
      const reads = await Promise.all(
        items.map(it => txn.get(doc(db, 'products', it.productId)))
      );

      // 2. Validate
      for (let i = 0; i < items.length; i++) {
        const snap = reads[i];
        if (!snap.exists()) {
          throw new Error(`Barang ID "${items[i].productId}" tidak ditemukan.`);
        }
        if (items[i].qty <= 0) {
          throw new Error(`Kuantitas untuk "${snap.data().name}" harus lebih besar dari 0.`);
        }
      }

      // 3. Write updates and transaction records
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snap = reads[i];
        const prod = snap.data() as Product;
        const newBalance = prod.currentStock + item.qty;

        txn.update(doc(db, 'products', prod.id), {
          currentStock: newBalance,
          updatedAt: now,
        });

        const txId = generateId('TX-IN');
        const txDoc: StockTransaction = {
          id: txId,
          productId: prod.id,
          productName: prod.name,
          type: type === 'RETUR' ? 'RETUR' : 'MASUK',
          qty: item.qty,
          direction: 'IN',
          balanceAfter: newBalance,
          date,
          referenceNo: referenceNo || (type === 'RETUR' ? 'RETUR-MASUK' : 'STOK-MASUK'),
          notes: notes || (type === 'RETUR' ? 'Pengembalian / Retur Penjualan' : 'Penerimaan Stok Gudang'),
          source: type === 'RETUR' ? 'RETUR' : 'PEMBELIAN',
          createdBy: userEmail,
          createdAt: now,
        };
        txn.set(doc(db, 'transactions', txId), txDoc);
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'transactions');
  }
}

/**
 * Record Stock Out Non-Sales (Sample, Tester, Internal, etc.)
 * Strictly validates sufficient stock in atomic transaction.
 */
export async function recordStockOutNonSales(
  date: string,
  soNumber: string,
  items: { productId: string; qty: number }[],
  purposeNotes: string,
  userEmail: string
): Promise<void> {
  if (!soNumber.trim()) throw new Error('Nomor SO wajib diisi.');
  if (items.length === 0) throw new Error('Minimal harus ada 1 barang keluar.');
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (txn) => {
      // 1. Read all product docs
      const reads = await Promise.all(
        items.map(it => txn.get(doc(db, 'products', it.productId)))
      );

      // 2. Validate sufficient stock
      for (let i = 0; i < items.length; i++) {
        const snap = reads[i];
        if (!snap.exists()) {
          throw new Error(`Barang ID "${items[i].productId}" tidak ditemukan.`);
        }
        const prod = snap.data() as Product;
        const requested = items[i].qty;
        if (requested <= 0) {
          throw new Error(`Qty keluar untuk "${prod.name}" harus positif.`);
        }
        if (prod.currentStock < requested) {
          throw new Error(
            `Stok "${prod.name}" tidak mencukupi! Tersedia: ${prod.currentStock}, Diminta: ${requested}. Transaksi dibatalkan.`
          );
        }
      }

      // 3. Atomically decrement stock and insert transaction log
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snap = reads[i];
        const prod = snap.data() as Product;
        const newBalance = prod.currentStock - item.qty;

        txn.update(doc(db, 'products', prod.id), {
          currentStock: newBalance,
          updatedAt: now,
        });

        const txId = generateId('TX-OUT-NON');
        const txDoc: StockTransaction = {
          id: txId,
          productId: prod.id,
          productName: prod.name,
          type: 'KELUAR_NON_PENJUALAN',
          qty: item.qty,
          direction: 'OUT',
          balanceAfter: newBalance,
          date,
          referenceNo: soNumber.trim(),
          notes: purposeNotes || 'Pengeluaran Non-Penjualan',
          source: 'NON_PENJUALAN',
          createdBy: userEmail,
          createdAt: now,
        };
        txn.set(doc(db, 'transactions', txId), txDoc);
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'transactions');
  }
}

/**
 * Record Marketplace / Sales Upload (Shopee, TikTok, or General Sales)
 * Centralized stock deduction with atomic guarantee and duplicate batch logging
 */
export async function recordSalesStockOutBatch(
  platform: 'SHOPEE' | 'TIKTOK' | 'PENJUALAN_LAIN',
  transactionDate: string,
  items: { productId: string; productName: string; qty: number; orderId?: string }[],
  fileName: string,
  userEmail: string
): Promise<{ batchId: string; totalQty: number }> {
  if (items.length === 0) throw new Error('Tidak ada item valid untuk diproses.');

  const now = new Date().toISOString();
  const batchId = generateId(`BATCH-${platform}`);

  // Group by productId to test total demanded stock per product
  const demandByProduct = new Map<string, number>();
  items.forEach(it => {
    demandByProduct.set(it.productId, (demandByProduct.get(it.productId) || 0) + it.qty);
  });

  const uniqueProductIds = Array.from(demandByProduct.keys());

  try {
    await runTransaction(db, async (txn) => {
      // 1. Read all involved products
      const reads = await Promise.all(
        uniqueProductIds.map(pid => txn.get(doc(db, 'products', pid)))
      );

      // 2. Validate stock sufficiency for aggregated demand
      for (let i = 0; i < uniqueProductIds.length; i++) {
        const snap = reads[i];
        const pid = uniqueProductIds[i];
        if (!snap.exists()) {
          throw new Error(`Barang ID "${pid}" tidak ditemukan di master.`);
        }
        const prod = snap.data() as Product;
        const totalDemanded = demandByProduct.get(pid)!;

        if (prod.currentStock < totalDemanded) {
          throw new Error(
            `Stok barang "${prod.name}" tidak mencukupi untuk seluruh pesanan! ` +
            `Tersedia di gudang: ${prod.currentStock}, Total diminta dalam file: ${totalDemanded}. ` +
            `Silakan perbaiki file atau lakukan stok masuk terlebih dahulu.`
          );
        }
      }

      // Track running balance in transaction for each product
      const runningBalance = new Map<string, number>();
      reads.forEach(snap => {
        const prod = snap.data() as Product;
        runningBalance.set(prod.id, prod.currentStock);
      });

      // Determine transaction type and source label
      let txType: TransactionType = 'KELUAR_PENJUALAN';
      let txSource: TransactionSource = 'PENJUALAN_LAIN';
      if (platform === 'SHOPEE') {
        txType = 'KELUAR_SHOPEE';
        txSource = 'SHOPEE';
      } else if (platform === 'TIKTOK') {
        txType = 'KELUAR_TIKTOK';
        txSource = 'TIKTOK';
      }

      let grandTotalQty = 0;

      // 3. Write individual transactions
      for (const item of items) {
        grandTotalQty += item.qty;
        const cur = runningBalance.get(item.productId)!;
        const newBal = cur - item.qty;
        runningBalance.set(item.productId, newBal);

        const txId = generateId(`TX-OUT-${platform.substring(0, 3)}`);
        const txDoc: StockTransaction = {
          id: txId,
          productId: item.productId,
          productName: item.productName,
          type: txType,
          qty: item.qty,
          direction: 'OUT',
          balanceAfter: newBal,
          date: transactionDate,
          referenceNo: item.orderId || batchId,
          notes: `Upload Penjualan ${platform}${item.orderId ? ` (Pesanan: ${item.orderId})` : ''}`,
          source: txSource,
          batchId,
          createdBy: userEmail,
          createdAt: now,
        };
        txn.set(doc(db, 'transactions', txId), txDoc);
      }

      // 4. Update master product stock to the final running balances
      for (const pid of uniqueProductIds) {
        txn.update(doc(db, 'products', pid), {
          currentStock: runningBalance.get(pid)!,
          updatedAt: now,
        });
      }

      // 5. Save ImportBatch record for duplicate prevention and history
      const batchDoc: ImportBatch = {
        id: batchId,
        platform,
        transactionDate,
        importedAt: now,
        itemCount: items.length,
        totalQty: grandTotalQty,
        status: 'SUCCESS',
        fileName,
        createdBy: userEmail,
      };
      txn.set(doc(db, 'import_batches', batchId), batchDoc);
    });

    const totalQty = items.reduce((acc, cur) => acc + cur.qty, 0);
    return { batchId, totalQty };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'transactions');
  }
}

/**
 * -------------------------------------------------------------
 * IMPORT BATCHES & DUPLICATE CHECKS
 * -------------------------------------------------------------
 */

export async function getAllImportBatches(): Promise<ImportBatch[]> {
  try {
    const q = query(collection(db, 'import_batches'), orderBy('importedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ImportBatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'import_batches');
  }
}

/**
 * Check if a batch on the same date and platform was imported recently
 */
export async function checkPotentialDuplicateBatch(
  platform: string,
  transactionDate: string,
  fileName: string
): Promise<ImportBatch | null> {
  const batches = await getAllImportBatches();
  const match = batches.find(
    b =>
      b.platform.toUpperCase() === platform.toUpperCase() &&
      b.transactionDate === transactionDate &&
      b.fileName.toLowerCase() === fileName.toLowerCase()
  );
  return match || null;
}

/**
 * -------------------------------------------------------------
 * PRODUCT MAPPINGS (ALIASES FOR SHOPEE & TIKTOK)
 * -------------------------------------------------------------
 */

export async function getAllProductMappings(): Promise<ProductMapping[]> {
  try {
    const snap = await getDocs(collection(db, 'product_mappings'));
    return snap.docs.map(d => d.data() as ProductMapping);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'product_mappings');
  }
}

export async function saveProductMapping(
  marketplace: 'SHOPEE' | 'TIKTOK',
  rawName: string,
  targetProductId: string,
  targetProductName: string
): Promise<ProductMapping> {
  const cleanRaw = rawName.trim().replace(/\s+/g, ' ');
  const normRaw = normalizeText(cleanRaw);

  const mappingId = generateId(`MAP-${marketplace}`);
  const now = new Date().toISOString();

  const mapping: ProductMapping = {
    id: mappingId,
    marketplace,
    rawName: cleanRaw,
    normalizedRawName: normRaw,
    targetProductId,
    targetProductName,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'product_mappings', mappingId), mapping);
    return mapping;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `product_mappings/${mappingId}`);
  }
}

export async function deleteProductMapping(mappingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'product_mappings', mappingId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `product_mappings/${mappingId}`);
  }
}

/**
 * -------------------------------------------------------------
 * STOCK OPNAME
 * -------------------------------------------------------------
 */

export async function getAllStockOpnames(): Promise<StockOpnameSession[]> {
  try {
    const q = query(collection(db, 'stock_opname'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as StockOpnameSession);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'stock_opname');
  }
}

export async function saveStockOpnameDraft(
  opnameId: string,
  date: string,
  items: StockOpnameItem[],
  notes: string,
  userEmail: string
): Promise<string> {
  const id = opnameId || generateId('OPN');
  const now = new Date().toISOString();

  const totalDiff = items.reduce((sum, item) => sum + item.difference, 0);

  const session: StockOpnameSession = {
    id,
    date,
    status: 'DRAFT',
    createdBy: userEmail,
    items,
    totalDifference: totalDiff,
    notes,
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'stock_opname', id), session);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `stock_opname/${id}`);
  }
}

export async function confirmStockOpnameAdjustment(
  opnameId: string,
  date: string,
  items: StockOpnameItem[],
  notes: string,
  userEmail: string
): Promise<void> {
  const id = opnameId || generateId('OPN');
  const now = new Date().toISOString();

  try {
    await runTransaction(db, async (txn) => {
      // 1. Read all items
      const reads = await Promise.all(
        items.map(it => txn.get(doc(db, 'products', it.productId)))
      );

      // 2. Apply adjustments
      let totalDiff = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const snap = reads[i];
        if (!snap.exists()) continue;

        const currentInDb = snap.data().currentStock;
        // recalculate difference against live system stock
        const liveDifference = item.physicalStock - currentInDb;
        totalDiff += liveDifference;

        if (liveDifference !== 0) {
          // Update master product stock to the verified physical count
          txn.update(doc(db, 'products', item.productId), {
            currentStock: item.physicalStock,
            updatedAt: now,
          });

          // Record adjustment transaction
          const txId = generateId('TX-OPN');
          const txDoc: StockTransaction = {
            id: txId,
            productId: item.productId,
            productName: item.productName,
            type: 'PENYESUAIAN_OPNAME',
            qty: Math.abs(liveDifference),
            direction: 'ADJUST',
            balanceAfter: item.physicalStock,
            date,
            referenceNo: id,
            notes: `Penyesuaian Opname: Fisik ${item.physicalStock}, Sistem ${currentInDb} (Selisih: ${liveDifference > 0 ? '+' : ''}${liveDifference})`,
            source: 'OPNAME',
            createdBy: userEmail,
            createdAt: now,
          };
          txn.set(doc(db, 'transactions', txId), txDoc);
        }
      }

      // 3. Mark session as CONFIRMED
      const sessionDoc: StockOpnameSession = {
        id,
        date,
        status: 'CONFIRMED',
        createdBy: userEmail,
        items,
        totalDifference: totalDiff,
        notes: notes || 'Stok Opname Selesai & Disesuaikan',
        createdAt: now,
      };
      txn.set(doc(db, 'stock_opname', id), sessionDoc);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `stock_opname/${id}`);
  }
}

/**
 * -------------------------------------------------------------
 * DATA CONSISTENCY CHECKER (SYSTEM AUDIT)
 * -------------------------------------------------------------
 */

export interface ConsistencyCheckResult {
  productId: string;
  productName: string;
  dbStock: number;
  calculatedStock: number;
  isConsistent: boolean;
  totalIn: number;
  totalOut: number;
  totalAdjust: number;
  transactionCount: number;
}

export async function checkInventoryConsistency(): Promise<ConsistencyCheckResult[]> {
  const [products, transactions] = await Promise.all([
    getAllProducts(),
    getAllTransactions(),
  ]);

  const results: ConsistencyCheckResult[] = [];

  for (const prod of products) {
    const prodTx = transactions.filter(t => t.productId === prod.id);

    let totalIn = 0;
    let totalOut = 0;
    let totalAdjust = 0;

    // Sort ascending by date & createdAt to reconstruct running ledger
    const sorted = [...prodTx].sort((a, b) => {
      if (a.date === b.date) {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      return a.date.localeCompare(b.date);
    });

    let running = 0;
    for (const tx of sorted) {
      if (tx.type === 'SALDO_AWAL' || tx.type === 'MASUK' || tx.type === 'RETUR') {
        totalIn += tx.qty;
        running += tx.qty;
      } else if (
        tx.type === 'KELUAR_SHOPEE' ||
        tx.type === 'KELUAR_TIKTOK' ||
        tx.type === 'KELUAR_PENJUALAN' ||
        tx.type === 'KELUAR_NON_PENJUALAN'
      ) {
        totalOut += tx.qty;
        running -= tx.qty;
      } else if (tx.type === 'PENYESUAIAN_OPNAME') {
        // balanceAfter represents exact stock after adjustment
        const delta = tx.balanceAfter - running;
        totalAdjust += delta;
        running = tx.balanceAfter;
      }
    }

    results.push({
      productId: prod.id,
      productName: prod.name,
      dbStock: prod.currentStock,
      calculatedStock: running,
      isConsistent: prod.currentStock === running,
      totalIn,
      totalOut,
      totalAdjust,
      transactionCount: prodTx.length,
    });
  }

  return results;
}
