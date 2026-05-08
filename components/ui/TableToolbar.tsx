import React from 'react';
import { Search, X } from 'lucide-react';

interface TableToolbarProps {
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  resultCount?: number;
  children?: React.ReactNode;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  searchTerm = '',
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  resultCount,
  children,
}) => {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100">
      {/* Search */}
      {onSearchChange && (
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Result count badge */}
      {searchTerm && resultCount !== undefined && (
        <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 whitespace-nowrap shrink-0">
          {resultCount} kết quả
        </span>
      )}

      {/* Right slot: export, density, etc. */}
      {children && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {children}
        </div>
      )}
    </div>
  );
};
