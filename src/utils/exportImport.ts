import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatWIBDateDisplay } from './dateUtils';

export function exportToExcel(data: Record<string, any>[], sheetName: string, fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportToCSV(data: Record<string, any>[], fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportReportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  fileName: string
) {
  // Landscape orientation for wide inventory tables
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(title, 14, 15);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(subtitle, 14, 22);

  // Table
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [37, 99, 235], // blue-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
  });

  doc.save(`${fileName}.pdf`);
}

export interface ParsedRow {
  rowNumber: number;
  rawName: string;
  qty: number;
  orderId?: string;
  raw: Record<string, any>;
  error?: string;
}

export async function parseExcelOrCsv(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to array of objects
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const parsed: ParsedRow[] = [];

  rawRows.forEach((row, idx) => {
    // Look for column names flexibly:
    // Name: 'Nama Barang', 'Nama Produk', 'Product Name', 'Barang', 'Item'
    // Qty: 'Qty', 'Jumlah', 'Quantity', 'Stok', 'Kuantitas'
    // Order ID: 'Order ID', 'No Pesanan', 'Nomor Pesanan', 'ID Pesanan'
    const keys = Object.keys(row);
    let nameVal = '';
    let qtyVal: any = null;
    let orderIdVal = '';

    for (const k of keys) {
      const cleanK = k.trim().toLowerCase();
      if (['nama barang', 'nama produk', 'product name', 'barang', 'item', 'produk'].includes(cleanK)) {
        nameVal = String(row[k] || '').trim();
      } else if (['qty', 'jumlah', 'quantity', 'kuantitas', 'stok', 'total qty'].includes(cleanK)) {
        qtyVal = row[k];
      } else if (['order id', 'no pesanan', 'nomor pesanan', 'id pesanan', 'order_id'].includes(cleanK)) {
        orderIdVal = String(row[k] || '').trim();
      }
    }

    // Fallback if column headers didn't match directly:
    if (!nameVal && keys[0]) {
      nameVal = String(row[keys[0]] || '').trim();
    }
    if (qtyVal === null && keys[1]) {
      qtyVal = row[keys[1]];
    }

    let parsedQty = 0;
    let error: string | undefined = undefined;

    if (!nameVal) {
      error = 'Nama Barang / Produk kosong';
    } else {
      const num = Number(qtyVal);
      if (isNaN(num)) {
        error = `Qty "${qtyVal}" bukan angka yang valid`;
      } else if (num < 0) {
        error = `Qty (${num}) tidak boleh bernilai negatif`;
      } else {
        parsedQty = Math.round(num);
      }
    }

    parsed.push({
      rowNumber: idx + 2, // 1-indexed, header is row 1
      rawName: nameVal,
      qty: parsedQty,
      orderId: orderIdVal || undefined,
      raw: row,
      error,
    });
  });

  return parsed;
}

export function downloadMasterTemplate(type: 'xlsx' | 'csv') {
  const sample = [
    { 'Nama Barang': 'Produk A - Serum 30ml', 'Qty': 100 },
    { 'Nama Barang': 'Produk B - Toner 100ml', 'Qty': 250 },
    { 'Nama Barang': 'Produk C - Cleanser 50ml', 'Qty': 75 },
  ];
  if (type === 'xlsx') {
    exportToExcel(sample, 'MasterBarang', 'Template_Master_Barang');
  } else {
    exportToCSV(sample, 'Template_Master_Barang');
  }
}

export function downloadSalesTemplate(platform: string, type: 'xlsx' | 'csv') {
  const sample = [
    { 'Nama Produk': 'Produk A - Serum 30ml', 'Qty': 10, 'No Pesanan': 'ORD-001' },
    { 'Nama Produk': 'Produk B - Toner 100ml', 'Qty': 5, 'No Pesanan': 'ORD-002' },
    { 'Nama Produk': 'Produk C - Cleanser 50ml', 'Qty': 8, 'No Pesanan': 'ORD-003' },
  ];
  const name = `Template_Penjualan_${platform.toUpperCase()}`;
  if (type === 'xlsx') {
    exportToExcel(sample, 'Penjualan', name);
  } else {
    exportToCSV(sample, name);
  }
}
