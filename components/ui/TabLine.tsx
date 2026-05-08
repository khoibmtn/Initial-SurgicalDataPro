import React, { useRef, useEffect, useState } from 'react';

interface TabLineOption {
  value: string;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
  badgeColor?: string;
}

interface TabLineProps {
  options: TabLineOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  bordered?: boolean;
}

export const TabLine: React.FC<TabLineProps> = ({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  bordered = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (activeBtn) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicator({
        left: btnRect.left - containerRect.left,
        width: btnRect.width,
      });
    }
  }, [value, options]);

  const sizeClass = size === 'sm' ? 'tab-sm' : '';

  return (
    <div ref={containerRef} className={`tab-line ${bordered ? 'tab-line--bordered' : ''} ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            data-active={isActive}
            className={`tab-line-item ${sizeClass}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className={`h-4 w-4 ${isActive ? 'text-[#1a73e8]' : 'text-[#5f6368]'} transition-colors`} />}
              {opt.label}
            </span>
            {opt.badge !== undefined && opt.badge !== null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1.5 ${isActive
                ? 'bg-blue-100 text-blue-700'
                : (opt.badgeColor || 'bg-gray-100 text-gray-500')
              }`}>
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
      {/* Animated underline indicator */}
      <span
        className="tab-line-indicator"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
        }}
      />
    </div>
  );
};
