import React, { useState, useRef, useEffect } from 'react';
import { ListChecks, ChevronDown, Check } from 'lucide-react';
import { PaymentList } from '../../types/paymentList';

export type PaymentListSelection = 'all' | 'unpaid' | string;

export function formatReportMonthYearLabel(
  periodKey?: string,
  dateFrom?: string,
  dateRangeText?: string
): string {
  if (periodKey) {
    const m = periodKey.match(/^(\d{4})-(\d{2})$/);
    if (m) return `Tất cả DVYC trong tháng ${m[2]}/${m[1]}`;
  }
  if (dateFrom) {
    const m = dateFrom.match(/^(\d{4})-(\d{2})/);
    if (m) return `Tất cả DVYC trong tháng ${m[2]}/${m[1]}`;
  }
  if (dateRangeText) {
    const m = dateRangeText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `Tất cả DVYC trong tháng ${m[2]}/${m[3]}`;
  }
  return 'Tất cả DVYC trong tháng';
}

interface Props {
  lists: PaymentList[];
  value: PaymentListSelection;
  onChange: (v: PaymentListSelection) => void;
  /** Hiển thị thêm lựa chọn "Chưa gán đợt" */
  allowUnpaid?: boolean;
  unpaidLabel?: string;
  unpaidCount?: number;
  allCount?: number;
  listCounts?: Record<string, number>;
  /** Gói DV tab only: shows the manage-lists button */
  onManage?: () => void;
  allLabel?: string;
}

export const PaymentListSelector: React.FC<Props> = ({
  lists,
  value,
  onChange,
  allowUnpaid,
  unpaidLabel = 'Chưa gán đợt',
  unpaidCount,
  allCount,
  listCounts,
  onManage,
  allLabel = 'Tất cả DVYC trong tháng',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allDisplayText = `${allLabel}${allCount !== undefined ? ` (${allCount})` : ''}`;
  const unpaidDisplayText = `${unpaidLabel}${unpaidCount !== undefined ? ` (${unpaidCount})` : ''}`;

  const getBatchDisplayText = (l: PaymentList) => {
    const count = listCounts && listCounts[l.id] !== undefined ? listCounts[l.id] : l.items.length;
    return `${l.status === 'locked' ? '🔒 ' : ''}${l.name} (${count})`;
  };

  let currentDisplayText = allDisplayText;
  if (value === 'unpaid' && allowUnpaid) {
    currentDisplayText = unpaidDisplayText;
  } else if (value !== 'all') {
    const found = lists.find(l => l.id === value);
    if (found) {
      currentDisplayText = getBatchDisplayText(found);
    }
  }

  return (
    <div className="flex items-center gap-1" ref={containerRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-label="Chọn danh sách thanh toán"
          className={`flex h-8 min-w-[230px] max-w-[310px] items-center justify-between gap-2 rounded-lg border bg-white px-2.5 text-xs font-semibold text-gray-700 cursor-pointer transition-all focus:outline-none ${
            open
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <span className="truncate">{currentDisplayText}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${
              open ? 'rotate-180 text-emerald-700' : ''
            }`}
          />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 min-w-[260px] w-max max-w-[340px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
            {/* Lựa chọn 1: Tất cả DVYC trong tháng mm/yyyy */}
            <button
              type="button"
              onClick={() => {
                onChange('all');
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                value === 'all'
                  ? 'bg-emerald-50 font-bold text-emerald-800'
                  : 'font-medium text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="truncate">{allDisplayText}</span>
              {value === 'all' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
            </button>

            {/* Lựa chọn 2: Chưa gán đợt */}
            {allowUnpaid && (
              <button
                type="button"
                onClick={() => {
                  onChange('unpaid');
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                  value === 'unpaid'
                    ? 'bg-emerald-50 font-bold text-emerald-800'
                    : 'font-medium text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="truncate">{unpaidDisplayText}</span>
                {value === 'unpaid' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </button>
            )}

            {/* Dòng kẻ ngang phân tách + Label "Các đợt thanh toán:" (xám đậm) */}
            <div className="my-1.5 border-t border-gray-300" />
            <div className="px-2.5 py-1 text-xs font-bold text-gray-700 select-none">
              Các đợt thanh toán:
            </div>

            {/* Danh sách các đợt thanh toán */}
            {lists.length === 0 ? (
              <div className="px-2.5 py-1.5 text-xs text-gray-400 italic">
                Chưa có đợt thanh toán
              </div>
            ) : (
              lists.map(l => {
                const isSelected = value === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      onChange(l.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 font-bold text-emerald-800'
                        : 'font-medium text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="truncate">{getBatchDisplayText(l)}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {onManage && (
        <button
          onClick={onManage}
          className="flex h-8 items-center gap-1 rounded-lg border border-primary-800 bg-primary-700 px-2 text-xs font-semibold text-white hover:bg-primary-800 transition-colors"
        >
          <ListChecks className="h-3.5 w-3.5" /> Quản lý DS
        </button>
      )}
    </div>
  );
};
