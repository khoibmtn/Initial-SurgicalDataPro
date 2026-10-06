import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Calendar,
  Lock,
  Edit3,
  Trash2,
  Check,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { PaymentList } from '../../types/paymentList';
import { renameList, deletePaymentList } from '../../services/paymentListService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lists: PaymentList[];
  currentListId?: string;
  onSelectList?: (listId: string) => void;
  reportYears?: number[];
  userName: string;
}

function formatDateTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const PaymentListManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  lists,
  currentListId,
  onSelectList,
  reportYears = [],
  userName,
}) => {
  // Collect all available creation years
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const l of lists) {
      const y = l.createdAt ? new Date(l.createdAt).getFullYear() : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [lists]);

  // Year filter state: defaults to report year if available, else 'all'
  const defaultYear = reportYears.length > 0 ? reportYears[0].toString() : 'all';
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const [searchQuery, setSearchQuery] = useState('');

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation state
  const [deletingList, setDeletingList] = useState<PaymentList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered lists by year and search query
  const filteredLists = useMemo(() => {
    let result = [...lists];

    if (selectedYear !== 'all') {
      const y = parseInt(selectedYear, 10);
      result = result.filter(l => {
        const listY = l.createdAt ? new Date(l.createdAt).getFullYear() : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
        return listY === y;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.createdBy || '').toLowerCase().includes(q) ||
        (l.updatedBy || '').toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [lists, selectedYear, searchQuery]);

  if (!isOpen) return null;

  const handleStartEdit = (l: PaymentList) => {
    if (l.status === 'locked') return;
    setEditingId(l.id);
    setEditingName(l.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    setIsSavingEdit(true);
    try {
      await renameList(id, editingName.trim(), userName);
      setEditingId(null);
      setEditingName('');
    } catch (err: any) {
      alert(err?.message || 'Không thể đổi tên đợt thanh toán.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingList) return;
    setIsDeleting(true);
    try {
      await deletePaymentList(deletingList.id);
      if (currentListId === deletingList.id) {
        onSelectList?.('all');
      }
      setDeletingList(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa đợt thanh toán.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-inter">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-teal-50/80 via-white to-sky-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 shadow-2xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">
                Danh sách đợt thanh toán gói dịch vụ
              </h2>
              <p className="text-xs text-gray-500">
                Quản lý, chỉnh sửa tên đợt, xem lịch sử tạo và người cập nhật cuối
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar: Bộ lọc năm + Tìm kiếm */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-teal-600" />
              <span>Năm tạo đợt:</span>
            </span>
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-gray-200 shadow-2xs">
              <button
                onClick={() => setSelectedYear('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedYear === 'all'
                    ? 'bg-teal-600 text-white shadow-2xs font-bold'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Tất cả các năm
              </button>
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y.toString())}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    selectedYear === y.toString()
                      ? 'bg-teal-600 text-white shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đợt, người tạo..."
              className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-teal-500 bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Body Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-2xs bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-center w-10">#</th>
                  <th className="px-3 py-2.5 min-w-[200px]">Tên đợt thanh toán</th>
                  <th className="px-2.5 py-2.5 text-center w-20">Số ca</th>
                  <th className="px-3 py-2.5 text-center w-28">Trạng thái</th>
                  <th className="px-3 py-2.5 text-center w-36">Ngày tạo</th>
                  <th className="px-3 py-2.5 w-32">Người tạo</th>
                  <th className="px-3 py-2.5 text-center w-36">Sửa đổi cuối</th>
                  <th className="px-3 py-2.5 w-32">Người sửa</th>
                  <th className="px-2.5 py-2.5 text-center w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLists.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400 italic">
                      {searchQuery
                        ? 'Không tìm thấy đợt thanh toán phù hợp với từ khóa.'
                        : 'Chưa có đợt thanh toán nào trong năm đã chọn.'}
                    </td>
                  </tr>
                ) : (
                  filteredLists.map((l, idx) => {
                    const isSelected = currentListId === l.id;
                    const isEditing = editingId === l.id;

                    return (
                      <tr
                        key={l.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-teal-50/40 hover:bg-teal-50/60'
                            : 'hover:bg-gray-50/60'
                        }`}
                      >
                        {/* STT */}
                        <td className="px-3 py-2.5 text-center text-gray-400 font-mono">
                          {idx + 1}
                        </td>

                        {/* Tên đợt (Inline Edit) */}
                        <td className="px-3 py-2.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 max-w-sm">
                              <input
                                type="text"
                                autoFocus
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEdit(l.id);
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                                className="flex-1 px-2 py-1 text-xs border border-teal-500 rounded-md outline-none bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-teal-500"
                              />
                              <button
                                onClick={() => handleSaveEdit(l.id)}
                                disabled={isSavingEdit || !editingName.trim()}
                                className="p-1 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-2xs disabled:opacity-50"
                                title="Lưu tên đợt"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSavingEdit}
                                className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                title="Hủy"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <span className="font-semibold text-gray-800 text-[13px]">
                                {l.name}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-teal-100 text-teal-800">
                                  Đang xem
                                </span>
                              )}
                              {l.status === 'draft' && (
                                <button
                                  onClick={() => handleStartEdit(l)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
                                  title="Chỉnh sửa tên đợt (edit inline)"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Số ca */}
                        <td className="px-2.5 py-2.5 text-center font-bold text-gray-700 font-mono">
                          {l.items.length} ca
                        </td>

                        {/* Trạng thái */}
                        <td className="px-3 py-2.5 text-center">
                          {l.status === 'locked' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-300 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <Lock className="h-3 w-3 shrink-0" />
                              <span>Đã chốt</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              <span>📝</span>
                              <span>Đang mở</span>
                            </span>
                          )}
                        </td>

                        {/* Ngày tạo */}
                        <td className="px-3 py-2.5 text-center text-gray-600 font-mono text-[11px]">
                          {formatDateTime(l.createdAt)}
                        </td>

                        {/* Người tạo */}
                        <td className="px-3 py-2.5 text-gray-700 font-medium">
                          {l.createdBy || '—'}
                        </td>

                        {/* Ngày sửa đổi cuối */}
                        <td className="px-3 py-2.5 text-center text-gray-600 font-mono text-[11px]">
                          {formatDateTime(l.updatedAt)}
                        </td>

                        {/* Người sửa cuối */}
                        <td className="px-3 py-2.5 text-gray-700 font-medium">
                          {l.updatedBy || l.createdBy || '—'}
                        </td>

                        {/* Thao tác (Xóa đợt) */}
                        <td className="px-2.5 py-2.5 text-center">
                          <button
                            onClick={() => setDeletingList(l)}
                            disabled={l.status === 'locked'}
                            className={`p-1.5 rounded transition-colors ${
                              l.status === 'locked'
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
                            }`}
                            title={
                              l.status === 'locked'
                                ? 'Đợt đã chốt thanh toán, không thể xóa'
                                : 'Xóa đợt thanh toán này'
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-5 py-3 text-xs text-gray-500">
          <span>
            Hiển thị <strong>{filteredLists.length}</strong> / <strong>{lists.length}</strong> đợt thanh toán
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingList && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isDeleting && setDeletingList(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-800">
                  Xác nhận xóa đợt thanh toán
                </h4>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Bạn có chắc muốn xóa đợt thanh toán <strong>"{deletingList.name}"</strong> ({deletingList.items.length} ca)?
                </p>
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                  ⚠️ Hành động này không thể hoàn tác. Các ca trong đợt này sẽ được đưa về trạng thái chưa thanh toán gói DV.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setDeletingList(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Đang xóa...' : 'Xóa đợt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
