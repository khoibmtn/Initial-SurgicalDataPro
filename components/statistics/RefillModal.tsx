import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PlusCircle,
  ArrowRight,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Equal
} from 'lucide-react';
import { RefillCandidateItem } from '../../types';

interface RefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  candidates: RefillCandidateItem[];
  onConfirm: (selectedCandidates: RefillCandidateItem[]) => Promise<void>;
  isConfirming?: boolean;
  confirmLabel?: string;
}

const fmtMoney = (n?: number) => {
  if (n === undefined || n === null) return '-';
  return n.toLocaleString('vi-VN') + ' ₫';
};

export const RefillModal: React.FC<RefillModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  candidates: initialCandidates,
  onConfirm,
  isConfirming = false,
  confirmLabel = 'Xác nhận áp giá vào Danh mục giá',
}) => {
  const [items, setItems] = useState<RefillCandidateItem[]>(initialCandidates);
  const [filterMode, setFilterMode] = useState<'all' | 'diff' | 'update' | 'create'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sync state when initialCandidates changes
  React.useEffect(() => {
    setItems(initialCandidates);
  }, [initialCandidates]);

  // Statistics
  const stats = useMemo(() => {
    let priceDiffCount = 0;
    let createCount = 0;
    let updateCount = 0;
    let selectedCount = 0;

    items.forEach((item) => {
      if (item.selected) selectedCount++;
      if (item.action === 'create') createCount++;
      else {
        updateCount++;
        if (item.oldPrice !== item.newPrice) priceDiffCount++;
      }
    });

    return {
      total: items.length,
      priceDiffCount,
      createCount,
      updateCount,
      selectedCount,
    };
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Filter by mode
      if (filterMode === 'diff' && item.action === 'update' && item.oldPrice === item.newPrice) {
        return false;
      }
      if (filterMode === 'create' && item.action !== 'create') return false;
      if (filterMode === 'update' && item.action !== 'update') return false;

      // Filter by search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = item.tenKT.toLowerCase().includes(q);
        const matchCode = item.maTuongDuong.toLowerCase().includes(q);
        return matchName || matchCode;
      }

      return true;
    });
  }, [items, filterMode, searchTerm]);

  // Toggle single item
  const handleToggle = (item: RefillCandidateItem) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it === item || (it.maTuongDuong === item.maTuongDuong && it.newPrice === item.newPrice)) {
          return { ...it, selected: !it.selected };
        }
        return it;
      })
    );
  };

  // Toggle all filtered items
  const isAllFilteredSelected = filteredItems.length > 0 && filteredItems.every((it) => it.selected);

  const handleToggleAll = () => {
    const nextVal = !isAllFilteredSelected;
    const filteredKeys = new Set(filteredItems.map((it) => `${it.maTuongDuong}_${it.newPrice}`));
    setItems((prev) =>
      prev.map((it) => {
        if (filteredKeys.has(`${it.maTuongDuong}_${it.newPrice}`)) {
          return { ...it, selected: nextVal };
        }
        return it;
      })
    );
  };

  const handleSelectOnlyChanged = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        selected: it.action === 'create' || it.oldPrice !== it.newPrice,
      }))
    );
  };

  const handleConfirm = async () => {
    const selected = items.filter((it) => it.selected);
    if (selected.length === 0) return;
    await onConfirm(selected);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col w-full max-w-5xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                {title}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col">
            <span className="text-gray-500 text-[11px]">Tổng mục đối chiếu</span>
            <span className="font-bold text-gray-800 text-base">{stats.total}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col">
            <span className="text-emerald-700 font-semibold text-[11px]">Giá có thay đổi</span>
            <span className="font-bold text-emerald-800 text-base">{stats.priceDiffCount}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col">
            <span className="text-amber-700 font-semibold text-[11px]">Thêm mới vào DM</span>
            <span className="font-bold text-amber-800 text-base">{stats.createCount}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col">
            <span className="text-blue-700 font-semibold text-[11px]">Đã chọn để áp giá</span>
            <span className="font-bold text-blue-800 text-base">{stats.selectedCount} / {stats.total}</span>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterMode === 'all'
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tất cả ({stats.total})
            </button>
            <button
              onClick={() => setFilterMode('diff')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterMode === 'diff'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cần thay đổi ({stats.priceDiffCount + stats.createCount})
            </button>
            <button
              onClick={() => setFilterMode('update')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterMode === 'update'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cập nhật ({stats.updateCount})
            </button>
            <button
              onClick={() => setFilterMode('create')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterMode === 'create'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Thêm mới ({stats.createCount})
            </button>
          </div>

          <div className="flex items-center gap-3 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên DVKT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={handleSelectOnlyChanged}
              className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
            >
              Chọn mục có đổi giá
            </button>
          </div>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Không tìm thấy mục nào phù hợp với bộ lọc
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-gray-600 font-semibold sticky top-0 z-10 border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">
                    <button
                      onClick={handleToggleAll}
                      className="text-gray-500 hover:text-gray-900 transition-colors"
                      title={isAllFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Tên DVKT</th>
                  <th className="py-2.5 px-3 w-32">Mã tương đương</th>
                  <th className="py-2.5 px-3 w-40">Khoảng hiệu lực</th>
                  <th className="py-2.5 px-3 text-right w-28">Giá cũ trong DM</th>
                  <th className="py-2.5 px-3 text-right w-28">Giá mới (Excel)</th>
                  <th className="py-2.5 px-3 text-center w-24">Số ca khớp</th>
                  <th className="py-2.5 px-3 text-center w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item, idx) => {
                  const hasPriceChange = item.action === 'create' || item.oldPrice !== item.newPrice;

                  return (
                    <tr
                      key={`${item.maTuongDuong}_${item.newPrice}_${idx}`}
                      onClick={() => handleToggle(item)}
                      className={`cursor-pointer transition-colors ${
                        item.selected
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                          : 'hover:bg-gray-50/80 text-gray-500'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggle(item)}
                          className="text-gray-400 hover:text-gray-700"
                        >
                          {item.selected ? (
                            <CheckSquare className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">
                        <div className="flex items-center gap-1.5">
                          {item.tenKT}
                          {item.conflictWarning && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 cursor-help whitespace-nowrap"
                              title={`Cảnh báo: Nhiều mức giá BHYT — ${item.conflictWarning}`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Đa giá
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {item.maTuongDuong}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 text-[11px]">
                        {item.effectiveFrom} → {item.effectiveTo || 'nay'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                        {item.oldPrice !== undefined ? (
                          <span className={hasPriceChange ? 'line-through text-gray-400' : ''}>
                            {fmtMoney(item.oldPrice)}
                          </span>
                        ) : (
                          <span className="text-gray-300">Chưa có</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        {fmtMoney(item.newPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.matchedCount} ca
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.action === 'create' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <PlusCircle className="h-3 w-3" /> Thêm mới
                          </span>
                        ) : hasPriceChange ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <ArrowRight className="h-3 w-3" /> Cập nhật
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                            <Equal className="h-3 w-3" /> Giữ nguyên
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-slate-50/80">
          <div className="text-xs text-gray-500">
            Đã chọn <strong className="text-emerald-700 font-bold">{stats.selectedCount}</strong> / {stats.total} mục
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200/70 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={stats.selectedCount === 0 || isConfirming}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                stats.selectedCount > 0 && !isConfirming
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-emerald-200'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isConfirming ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Đang xử lý áp giá...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {confirmLabel} ({stats.selectedCount})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
