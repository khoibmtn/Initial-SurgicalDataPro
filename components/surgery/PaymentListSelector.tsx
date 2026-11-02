import React from 'react';
import { ListChecks } from 'lucide-react';
import { PaymentList } from '../../types/paymentList';

export type PaymentListSelection = 'all' | 'unpaid' | string;

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
  allLabel = 'Tất cả ca đã gán',
}) => (
  <div className="flex items-center gap-1">
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Chọn danh sách thanh toán"
      className="h-8 max-w-[270px] rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
    >
      <option value="all">
        {allLabel}{allCount !== undefined ? ` (${allCount})` : ''}
      </option>
      {allowUnpaid && (
        <option value="unpaid">
          {unpaidLabel}{unpaidCount !== undefined ? ` (${unpaidCount})` : ''}
        </option>
      )}
      {lists.map(l => {
        const count = listCounts && listCounts[l.id] !== undefined ? listCounts[l.id] : l.items.length;
        return (
          <option key={l.id} value={l.id}>
            {l.status === 'locked' ? '🔒 ' : ''}{l.name} ({count})
          </option>
        );
      })}
    </select>
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
