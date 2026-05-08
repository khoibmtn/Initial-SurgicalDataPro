import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsiblePanelProps {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, isOpen]);

  return (
    <div className={`border border-gray-200 rounded-lg bg-white overflow-hidden ${className}`}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {Icon && <Icon className="h-4 w-4 text-gray-400 shrink-0" />}
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Content */}
      <div
        className="collapsible-content"
        style={{
          maxHeight: isOpen ? `${contentHeight}px` : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
};
