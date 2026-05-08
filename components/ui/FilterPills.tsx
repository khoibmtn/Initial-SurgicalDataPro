import React from 'react';

interface FilterPillItem {
  key: string;
  label: string;
  count?: number;
  color?: 'default' | 'danger' | 'warning' | 'success';
}

interface FilterPillsProps {
  items: FilterPillItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

const colorMap = {
  default: 'bg-gray-500',
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-green-500',
};

export const FilterPills: React.FC<FilterPillsProps> = ({
  items,
  active,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center gap-1.5 overflow-x-auto ${className}`}
      style={{ height: 'var(--filter-h)' }}
    >
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200 shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
            }`}
          >
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white ${
                  isActive
                    ? colorMap[item.color || 'default']
                    : 'bg-gray-400'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
