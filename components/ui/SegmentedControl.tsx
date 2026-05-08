import React from 'react';

interface SegmentedControlOption {
  value: string;
  label: string;
  icon?: React.ElementType;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`segmented-control ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            data-active={opt.value === value}
            className="segmented-control-item"
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
