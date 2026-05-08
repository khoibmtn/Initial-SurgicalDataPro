import React from 'react';

interface KPIItem {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  color?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
}

interface KPIBarProps {
  items: KPIItem[];
  className?: string;
}

const dotColorMap = {
  neutral: 'bg-gray-400',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

const valueColorMap = {
  neutral: 'text-gray-700',
  success: 'text-emerald-700',
  danger: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-700',
};

export const KPIBar: React.FC<KPIBarProps> = ({ items, className = '' }) => {
  return (
    <div
      className={`flex items-center gap-0 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden divide-x divide-gray-200 ${className}`}
      style={{ height: 36 }}
    >
      {items.map((item, idx) => {
        const color = item.color || 'neutral';
        const hasIssue = typeof item.value === 'number' && item.value > 0 && (color === 'danger' || color === 'warning');
        return (
          <div
            key={idx}
            className={`flex items-center gap-1.5 px-3 h-full text-xs transition-colors ${hasIssue ? 'bg-red-50/60' : 'hover:bg-white'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColorMap[color]}`} />
            <span className="text-gray-500 font-medium whitespace-nowrap">{item.label}</span>
            <span className={`font-bold tabular-nums ${valueColorMap[color]}`}>
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};
