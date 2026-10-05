import React from 'react';
import { ListChecks } from 'lucide-react';
import { PaymentList } from '../../types/paymentList';

export type PaymentListSelection = 'all' | 'unpaid' | string;

interface Props {
  lists: PaymentList[];
  value: PaymentListSelection;
  onChange: (v: PaymentListSelection) => void;
  /** Gói DV tab only: shows the "Chưa thanh toán" option */
  allowUnpaid?: boolean;
  /** Gói DV tab only: shows the manage-lists button */
  onManage?: () => void;
  allLabel?: string;
}

export const PaymentListSelector: React.FC<Props> = ({
  lists, value, onChange, allowUnpaid, onManage, allLabel = 'Tất cả ca đã gán',
}) => (
  <div className="flex items-center gap-1">
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Chọn danh sách thanh toán"
      className="h-8 max-w-[200px] rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700"
    >
      <option value="all">{allLabel}</option>
      {lists.map(l => (
        <option key={l.id} value={l.id}>{l.status === 'locked' ? '🔒 ' : ''}{l.name} ({l.items.length})</option>
      ))}
      {allowUnpaid && <option value="unpaid">Chưa thanh toán</option>}
    </select>
    {onManage && (
      <button
        onClick={onManage}
        className="flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
      >
        <ListChecks className="h-3.5 w-3.5" /> Quản lý DS
      </button>
    )}
  </div>
);
