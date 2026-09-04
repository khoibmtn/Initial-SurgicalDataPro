import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Scan,
  CheckCircle2,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  Loader2,
  Calendar,
  DollarSign,
  Layers,
} from 'lucide-react';
import { MissingCatalogCandidate } from '../../types';

interface MissingCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: MissingCatalogCandidate[];
  onConfirm: (selectedCandidates: MissingCatalogCandidate[]) => Promise<void>;
  isConfirming?: boolean;
}

const fmtMoney = (n?: number) => {
  if (n === undefined || n === null) return '0 ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
};

export const MissingCatalogModal: React.FC<MissingCatalogModalProps> = ({
  isOpen,
  onClose,
  candidates: initialCandidates,
  onConfirm,
  isConfirming = false,
}) => {
  const [items, setItems] = useState<MissingCatalogCandidate[]>(initialCandidates);
  const [searchTerm, setSearchTerm] = useState('');

  // Sync khi initialCandidates thay đổi
  useEffect(() => {
    setItems(initialCandidates);
  }, [initialCandidates]);

  // Thống kê
  const stats = useMemo(() => {
    let selectedCount = 0;
    let totalRecords = 0;
    let selectedRecords = 0;

    items.forEach((item) => {
      totalRecords += item.recordCount;
      if (item.selected) {
        selectedCount++;
        selectedRecords += item.recordCount;
      }
    });

    return {
      total: items.length,
      selectedCount,
      totalRecords,
      selectedRecords,
    };
  }, [items]);

  // Lọc theo từ khóa tìm kiếm
  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.tenKT.toLowerCase().includes(q) ||
        item.maTuongDuong.toLowerCase().includes(q)
    );
  }, [items, searchTerm]);

  if (!isOpen) return null;

  // Toggle 1 item
  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Select all / Deselect all
  const selectAll = (select: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  // Cập nhật giá trị trực tiếp trên dòng
  const updateItemField = (id: string, field: 'maTuongDuong' | 'effectiveFrom' | 'price', val: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: val } : item
      )
    );
  };

  const handleConfirm = () => {
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) return;
    onConfirm(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-indigo-50/50 via-white to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Đề xuất bổ sung Danh mục giá
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Quét CSDL phát hiện các kỹ thuật đã thực hiện nhưng chưa có trong Danh mục giá. Hãy xem lại và tích chọn các mục bạn đồng ý thêm.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats & Search Toolbar */}
        <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          {/* Stats Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="bg-white border border-gray-200 text-gray-700 font-semibold px-2.5 py-1 rounded-lg shadow-2xs">
              Tìm thấy: <strong className="text-indigo-600">{stats.total}</strong> kỹ thuật
            </span>
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold px-2.5 py-1 rounded-lg">
              Đã chọn: <strong>{stats.selectedCount}</strong> / {stats.total}
            </span>
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold px-2.5 py-1 rounded-lg">
              Tổng số ca liên quan: <strong>{stats.selectedRecords.toLocaleString('vi-VN')}</strong> ca
            </span>
          </div>

          {/* Actions & Search */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã TĐ hoặc tên kỹ thuật..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <button
              onClick={() => selectAll(stats.selectedCount !== stats.total)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors whitespace-nowrap shadow-2xs"
            >
              {stats.selectedCount === stats.total ? (
                <>
                  <Square className="w-3.5 h-3.5 text-gray-400" />
                  Bỏ chọn tất cả
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  Chọn tất cả
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[55vh]">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <AlertCircle className="w-10 h-10 stroke-1 mb-2 text-gray-300" />
              <p className="text-sm font-medium">Không tìm thấy kỹ thuật nào</p>
              <p className="text-xs text-gray-400 mt-1">
                Thử tìm với từ khóa khác hoặc xóa bộ lọc.
              </p>
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-gray-100/90 backdrop-blur-xs text-gray-600 font-semibold border-b border-gray-200 z-10">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={stats.selectedCount === stats.total && stats.total > 0}
                      onChange={(e) => selectAll(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="w-12 px-2 py-2.5 text-center text-gray-400">#</th>
                  <th className="w-32 px-3 py-2.5">Mã tương đương</th>
                  <th className="px-3 py-2.5 min-w-[220px]">Tên kỹ thuật</th>
                  <th className="w-32 px-3 py-2.5 text-center">Hiệu lực từ</th>
                  <th className="w-32 px-3 py-2.5 text-right">Đơn giá (VNĐ)</th>
                  <th className="w-24 px-3 py-2.5 text-center">Số ca mổ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`transition-colors cursor-pointer hover:bg-indigo-50/40 ${
                      item.selected ? 'bg-indigo-50/20' : 'opacity-65 bg-white'
                    }`}
                  >
                    <td
                      className="px-3 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(item.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2 text-center text-gray-400">
                      {idx + 1}
                    </td>
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={item.maTuongDuong}
                        onChange={(e) =>
                          updateItemField(item.id, 'maTuongDuong', e.target.value)
                        }
                        placeholder="Mã BHXH..."
                        className="w-full px-2 py-1 text-xs font-mono font-semibold text-blue-700 bg-white border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-800">
                        {item.tenKT}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="date"
                        value={item.effectiveFrom}
                        onChange={(e) =>
                          updateItemField(item.id, 'effectiveFrom', e.target.value)
                        }
                        className="px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={item.price || ''}
                        onChange={(e) =>
                          updateItemField(item.id, 'price', Number(e.target.value))
                        }
                        placeholder="0"
                        className="w-24 px-2 py-1 text-xs text-right font-semibold border border-gray-200 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                        {item.recordCount} ca
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {stats.selectedCount > 0 ? (
              <span>
                Sẽ thêm <strong className="text-indigo-700">{stats.selectedCount}</strong> kỹ thuật vào Danh mục giá. Bạn vẫn có thể chỉnh sửa giá hoặc thời hạn bất kỳ lúc nào sau khi thêm.
              </span>
            ) : (
              <span className="text-amber-600 font-medium">
                Vui lòng tích chọn ít nhất 1 kỹ thuật để thêm vào Danh mục giá.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isConfirming}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming || stats.selectedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang thêm...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Thêm {stats.selectedCount} mục đã chọn
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
