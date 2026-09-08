import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface PageComboboxProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  size?: 'sm' | 'md';
  placement?: 'top' | 'bottom';
}

/**
 * PageCombobox: Unified, modern pagination combobox (UI/UX Pro Max).
 * - Single seamless input control with embedded chevron (zero double-borders or nested boxes).
 * - Free numeric typing (digits only, auto-clamped to [1..totalPages] on commit/Enter).
 * - Dropdown selection with auto-scroll to current page and live-filtering as user types.
 */
export const PageCombobox: React.FC<PageComboboxProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  className = '',
  size = 'sm',
  placement = 'top',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState<string>(String(currentPage));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const safeTotalPages = Math.max(1, totalPages || 1);
  const safeCurrentPage = Math.max(1, Math.min(safeTotalPages, currentPage || 1));

  // Sync input value with external currentPage updates (e.g. Next / Prev buttons)
  useEffect(() => {
    setInputValue(String(safeCurrentPage));
  }, [safeCurrentPage]);

  // Auto-scroll dropdown list to active page when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (activeItemRef.current) {
          activeItemRef.current.scrollIntoView({ block: 'nearest' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle click outside to commit and close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitPage(inputValue);
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, inputValue, safeCurrentPage, safeTotalPages]);

  // Live filter pages based on user input
  const filteredPages = useMemo(() => {
    const trimmed = inputValue.trim();
    const all = Array.from({ length: safeTotalPages }, (_, i) => i + 1);

    if (!trimmed || trimmed === String(safeCurrentPage)) {
      return all;
    }

    const matches = all.filter((p) => String(p).includes(trimmed));
    return matches.length > 0 ? matches : all;
  }, [safeTotalPages, inputValue, safeCurrentPage]);

  const commitPage = (valStr: string) => {
    let num = parseInt(valStr, 10);
    if (isNaN(num)) {
      num = safeCurrentPage;
    } else {
      num = Math.max(1, Math.min(safeTotalPages, num));
    }
    setInputValue(String(num));
    if (num !== safeCurrentPage) {
      onPageChange(num);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only accept numeric digits 0-9
    const raw = e.target.value.replace(/\D/g, '');
    setInputValue(raw);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPage(inputValue);
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(String(safeCurrentPage));
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const next = Math.min(safeTotalPages, safeCurrentPage + 1);
        onPageChange(next);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const prev = Math.max(1, safeCurrentPage - 1);
        onPageChange(prev);
      }
    }
  };

  const handleSelectPage = (pageNum: number) => {
    setInputValue(String(pageNum));
    onPageChange(pageNum);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center gap-1.5 select-none ${className}`}
    >
      {/* Unified, single modern combobox container */}
      <div
        className={`relative inline-flex items-center bg-white border rounded-md transition-all shadow-2xs ${
          size === 'md' ? 'h-7 w-14' : 'h-6.5 w-13'
        } ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        title={`Trang ${safeCurrentPage} / ${safeTotalPages} (Gõ số trang hoặc nhấp để chọn)`}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            e.target.select();
            setIsOpen(true);
          }}
          style={{
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            background: 'transparent',
          }}
          className="w-full h-full pl-2 pr-5 text-center text-xs font-bold text-gray-800 cursor-text p-0 focus:ring-0 focus:outline-none"
        />

        {/* Embedded chevron trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleDropdown();
          }}
          tabIndex={-1}
          aria-label="Mở danh sách trang"
          style={{
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            background: 'transparent',
          }}
          className="absolute right-1 top-0 bottom-0 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors cursor-pointer px-0.5"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </button>
      </div>

      {/* Total pages label */}
      <span className="text-xs font-semibold text-gray-500 select-none">
        / {safeTotalPages}
      </span>

      {/* Floating Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 z-50 w-36 bg-white border border-gray-200/90 rounded-lg shadow-xl py-1 text-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100`}
        >
          <div className="px-3 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
            <span>Chọn trang</span>
            <span className="text-blue-600 font-bold">1 - {safeTotalPages}</span>
          </div>

          <div
            ref={listContainerRef}
            className="max-h-48 overflow-y-auto overflow-x-hidden divide-y divide-gray-50/70 scrollbar-thin"
          >
            {filteredPages.map((p) => {
              const isSelected = p === safeCurrentPage;
              return (
                <button
                  key={p}
                  type="button"
                  ref={isSelected ? activeItemRef : undefined}
                  onClick={() => handleSelectPage(p)}
                  className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="font-medium">Trang {p}</span>
                  {isSelected && <Check className="w-3 h-3 text-white stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export default PageCombobox;
