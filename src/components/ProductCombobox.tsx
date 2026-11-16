import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check, Package, AlertCircle } from 'lucide-react';
import { Product } from '../types/inventory';

interface ProductComboboxProps {
  products: Product[];
  value: string; // selected productId
  onChange: (productId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  stockPrefix?: string;
}

export const ProductCombobox: React.FC<ProductComboboxProps> = ({
  products,
  value,
  onChange,
  placeholder = 'Ketik nama barang untuk mencari...',
  disabled = false,
  required = false,
  className = '',
  stockPrefix = 'Stok saat ini',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Find currently selected product
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === value),
    [products, value]
  );

  // Sync query with selected product name when value changes or when closed
  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedProduct ? selectedProduct.name : '');
    }
  }, [selectedProduct, isOpen]);

  // Filter products based on query
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return products;
    }
    return products.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const idMatch = p.id.toLowerCase().includes(q);
      const normMatch = p.normalizedName ? p.normalizedName.toLowerCase().includes(q) : false;
      return nameMatch || idMatch || normMatch;
    });
  }, [products, query]);

  // Keep highlighted index in bounds
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(selectedProduct ? selectedProduct.name : '');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedProduct]);

  const handleSelect = (product: Product) => {
    onChange(product.id);
    setQuery(product.name);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredProducts.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredProducts[highlightedIndex]) {
          handleSelect(filteredProducts[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setQuery(selectedProduct ? selectedProduct.name : '');
        break;
      case 'Tab':
        setIsOpen(false);
        setQuery(selectedProduct ? selectedProduct.name : '');
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isOpen ? 'z-50' : 'z-10'} ${className}`}
    >
      {/* Hidden input for HTML form validation */}
      <input
        type="text"
        required={required}
        value={value}
        onChange={() => {}}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Main Search Input */}
      <div
        className={`relative flex items-center bg-white border rounded-xl transition-all ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="pl-2.5 text-slate-400 flex items-center pointer-events-none">
          <Search className="w-3.5 h-3.5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setIsOpen(true);
            inputRef.current?.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 bg-transparent focus:outline-hidden font-medium"
        />

        <div className="flex items-center gap-1 pr-2">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
              title="Hapus pilihan"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setQuery(selectedProduct ? selectedProduct.name : '');
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
            tabIndex={-1}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Results */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="p-1.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>
              {filteredProducts.length === 0
                ? 'Tidak ada produk cocok'
                : `${filteredProducts.length} barang ditemukan`}
            </span>
            <span className="text-[10px] text-slate-400">Gunakan panah & Enter</span>
          </div>

          <ul
            ref={listRef}
            className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs"
            role="listbox"
          >
            {filteredProducts.length === 0 ? (
              <li className="p-3 text-center text-slate-400 flex flex-col items-center justify-center gap-1">
                <AlertCircle className="w-4 h-4 text-slate-300" />
                <span>Barang "{query}" tidak ditemukan</span>
                <span className="text-[10px] text-slate-400">
                  Periksa ejaan atau daftarkan produk baru di Master Barang
                </span>
              </li>
            ) : (
              filteredProducts.map((p, idx) => {
                const isSelected = p.id === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(p)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                      isHighlighted ? 'bg-blue-50/80 text-blue-900' : 'text-slate-700 hover:bg-slate-50'
                    } ${isSelected ? 'font-bold bg-blue-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : isHighlighted
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          SKU: {p.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                          p.currentStock > 10
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.currentStock > 0
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {stockPrefix}: {p.currentStock}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
