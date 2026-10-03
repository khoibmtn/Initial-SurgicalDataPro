import React, { useState, useRef, useEffect, useCallback } from 'react';

interface TooltipProps {
  /** Nội dung tooltip */
  content: React.ReactNode;
  /** Vị trí hiển thị: trên, dưới, trái, phải */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Thời gian delay trước khi hiện (ms) */
  delay?: number;
  /** Element con được bọc */
  children: React.ReactElement;
  /** Tắt tooltip */
  disabled?: boolean;
  /** Max width */
  maxWidth?: number;
}

/**
 * Tooltip component dạng CSS-only, không phụ thuộc thư viện ngoài.
 * - Tự động đo vị trí và căn chỉnh, không bị tràn ra ngoài viewport.
 * - Hỗ trợ 4 hướng: top | bottom | left | right.
 * - Animation fade-in mượt mà.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  position = 'top',
  delay = 300,
  children,
  disabled = false,
  maxWidth = 280,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [actualPos, setActualPos] = useState(position);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], .fixed.inset-0.z-\\[9000\\], .fixed.inset-0.z-50')) {
      return;
    }
    timeoutRef.current = setTimeout(() => {
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], .fixed.inset-0.z-\\[9000\\], .fixed.inset-0.z-50')) {
        return;
      }
      setVisible(true);
    }, delay);
  }, [disabled, delay]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const handleClick = useCallback(() => {
    hide();
  }, [hide]);

  // Tính toán vị trí khi visible thay đổi
  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const gap = 8;

    let top = 0;
    let left = 0;
    let pos = position;

    // Thử vị trí ưu tiên, fallback nếu bị tràn viewport
    const calc = (p: string) => {
      switch (p) {
        case 'top':
          top = trigger.top - tooltip.height - gap;
          left = trigger.left + trigger.width / 2 - tooltip.width / 2;
          break;
        case 'bottom':
          top = trigger.bottom + gap;
          left = trigger.left + trigger.width / 2 - tooltip.width / 2;
          break;
        case 'left':
          top = trigger.top + trigger.height / 2 - tooltip.height / 2;
          left = trigger.left - tooltip.width - gap;
          break;
        case 'right':
          top = trigger.top + trigger.height / 2 - tooltip.height / 2;
          left = trigger.right + gap;
          break;
      }
    };

    calc(position);

    // Fallback: nếu tràn trên → chuyển xuống dưới
    if (position === 'top' && top < 4) {
      pos = 'bottom';
      calc('bottom');
    } else if (position === 'bottom' && top + tooltip.height > window.innerHeight - 4) {
      pos = 'top';
      calc('top');
    }

    // Giữ tooltip trong viewport theo chiều ngang
    if (left < 4) left = 4;
    if (left + tooltip.width > window.innerWidth - 4) {
      left = window.innerWidth - tooltip.width - 4;
    }

    setCoords({ top, left });
    setActualPos(pos);
  }, [visible, position]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!content || disabled) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={handleClick}
        onTouchStart={hide}
        className="inline-flex"
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>

      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`fixed z-40 px-3 py-2 rounded-lg text-xs font-medium
            bg-gray-900 text-white shadow-xl
            pointer-events-none select-none
            animate-tooltip-fade-in
            ${actualPos === 'top' ? 'origin-bottom' : ''}
            ${actualPos === 'bottom' ? 'origin-top' : ''}
            ${actualPos === 'left' ? 'origin-right' : ''}
            ${actualPos === 'right' ? 'origin-left' : ''}
          `}
          style={{
            top: coords.top,
            left: coords.left,
            maxWidth,
          }}
        >
          {content}
          {/* Arrow */}
          <span
            className={`absolute w-2 h-2 bg-gray-900 rotate-45 ${
              actualPos === 'top'
                ? 'bottom-[-4px] left-1/2 -translate-x-1/2'
                : actualPos === 'bottom'
                ? 'top-[-4px] left-1/2 -translate-x-1/2'
                : actualPos === 'left'
                ? 'right-[-4px] top-1/2 -translate-y-1/2'
                : 'left-[-4px] top-1/2 -translate-y-1/2'
            }`}
          />
        </div>
      )}
    </>
  );
};
