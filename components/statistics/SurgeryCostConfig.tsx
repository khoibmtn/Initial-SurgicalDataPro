/**
 * SurgeryCostConfig — Tab "Chi phí PTTT"
 * Hiển thị DM chi phí: Mã TĐ, Tên DVKT, Hiệu lực DVKT, Đơn giá, Hiệu lực Chi phí, CP thuốc, CP VTTH
 * Tự động format phân cách hàng nghìn bằng dấu chấm (.)
 * Inline edit, duplicate, delete, search, pagination, Excel export
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Download, Edit3, Save, X, Trash2, Copy,
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { SurgeryCostItem } from '../../types';
import {
  updateCostItem,
  deleteCostItem,
  duplicateCostItem,
  exportCostItemsExcel,
} from '../../services/surgeryCostService';
import { InstantTooltip } from './SurgeryNamePriceConfig';

interface Props {
  costItems: SurgeryCostItem[];
}

const PAGE_SIZE = 20;

const formatThousands = (val: number | string): string => {
  if (val === '' || val === null || val === undefined) return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

const parseThousands = (val: string): number => {
  const digits = String(val).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

const fmtMoney = (n: number) => (n > 0 ? n.toLocaleString('vi-VN') + ' ₫' : '—');

export const SurgeryCostConfig: React.FC<Props> = ({ costItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);

  // Inline edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMedicStr, setEditMedicStr] = useState<string>('');
  const [editVtthStr, setEditVtthStr] = useState<string>('');
  const [editCostFrom, setEditCostFrom] = useState<string>('');
  const [editCostTo, setEditCostTo] = useState<string>('');

  // Duplicate states
  const [dupItem, setDupItem] = useState<SurgeryCostItem | null>(null);
  const [dupDate, setDupDate] = useState('');
  const [dupMedicStr, setDupMedicStr] = useState('');
  const [dupVtthStr, setDupVtthStr] = useState('');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Filter + Paginate ---
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return costItems;
    return costItems.filter(c =>
      c.tenKT.toLowerCase().includes(term) ||
      c.maTuongDuong.toLowerCase().includes(term)
    );
  }, [costItems, searchTerm]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Reset page when search changes
  const handleSearch = useCallback((val: string) => {
    setSearchTerm(val);
    setPage(0);
  }, []);

  // --- Inline Edit ---
  const startEdit = (item: SurgeryCostItem) => {
    setEditingId(item.id);
    setEditMedicStr(item.medicCost > 0 ? formatThousands(item.medicCost) : '');
    setEditVtthStr(item.vtthCost > 0 ? formatThousands(item.vtthCost) : '');
    setEditCostFrom(item.costEffectiveFrom || item.effectiveFrom || '');
    setEditCostTo(item.costEffectiveTo || item.effectiveTo || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMedicStr('');
    setEditVtthStr('');
    setEditCostFrom('');
    setEditCostTo('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const medic = parseThousands(editMedicStr);
    const vtth = parseThousands(editVtthStr);

    if (medic <= 0) {
      showToast('Chi phí thuốc phải là số lớn hơn 0 (> 0)', 'error');
      return;
    }
    if (vtth <= 0) {
      showToast('Chi phí VTTH phải là số lớn hơn 0 (> 0)', 'error');
      return;
    }
    if (!editCostFrom) {
      showToast('Vui lòng chọn ngày bắt đầu hiệu lực chi phí', 'error');
      return;
    }
    if (editCostTo && editCostTo < editCostFrom) {
      showToast('Ngày kết thúc hiệu lực chi phí phải sau hoặc bằng ngày bắt đầu', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateCostItem(editingId, {
        medicCost: medic,
        vtthCost: vtth,
        costEffectiveFrom: editCostFrom,
        costEffectiveTo: editCostTo || null,
      });
      showToast('Đã cập nhật chi phí thành công');
      setEditingId(null);
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa mục này khỏi danh mục chi phí? Logic hiệu lực sẽ được tự động điều chỉnh.')) return;
    try {
      await deleteCostItem(id, costItems);
      showToast('Đã xóa mục chi phí');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    }
  };

  // --- Duplicate ---
  const startDuplicate = (item: SurgeryCostItem) => {
    setDupItem(item);
    setDupDate(new Date().toISOString().slice(0, 10));
    setDupMedicStr(item.medicCost > 0 ? formatThousands(item.medicCost) : '');
    setDupVtthStr(item.vtthCost > 0 ? formatThousands(item.vtthCost) : '');
  };

  const confirmDuplicate = async () => {
    if (!dupItem || !dupDate) return;
    const medic = parseThousands(dupMedicStr);
    const vtth = parseThousands(dupVtthStr);

    setSaving(true);
    try {
      await duplicateCostItem(
        dupItem.id,
        dupDate,
        costItems,
        medic > 0 ? medic : undefined,
        vtth > 0 ? vtth : undefined
      );
      showToast('Đã tạo phiên bản chi phí mới. Phiên bản cũ tự đóng hiệu lực.');
      setDupItem(null);
      setDupDate('');
    } catch (err: any) {
      showToast(err.message || 'Lỗi duplicate', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Duplicate Modal */}
      {dupItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Tạo phiên bản chi phí mới</h3>
            <p className="text-xs text-blue-700 font-semibold mb-2">{dupItem.maTuongDuong ? `[${dupItem.maTuongDuong}] ` : ''}{dupItem.tenKT}</p>
            <p className="text-xs text-gray-500 mb-4">
              Phiên bản chi phí cũ sẽ tự động đóng hiệu lực vào ngày trước ngày bắt đầu mới.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">Hiệu lực chi phí từ ngày <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={dupDate}
                  onChange={e => setDupDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Chi phí thuốc (VNĐ)</label>
                <input
                  type="text"
                  value={dupMedicStr}
                  placeholder="0"
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setDupMedicStr(digits ? Number(digits).toLocaleString('vi-VN') : '');
                  }}
                  className="mt-1 w-full px-3 py-2 text-sm text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Chi phí VTTH (VNĐ)</label>
                <input
                  type="text"
                  value={dupVtthStr}
                  placeholder="0"
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setDupVtthStr(digits ? Number(digits).toLocaleString('vi-VN') : '');
                  }}
                  className="mt-1 w-full px-3 py-2 text-sm text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setDupItem(null); setDupDate(''); }}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={confirmDuplicate}
                disabled={saving || !dupDate}
                className="px-4 py-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Đang tạo...' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Danh mục chi phí PTTT</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {costItems.length} mục chi phí
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InstantTooltip content="Xuất toàn bộ danh mục chi phí ra file Excel (.xlsx)">
            <button
              onClick={() => exportCostItemsExcel(costItems)}
              disabled={costItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất Excel
            </button>
          </InstantTooltip>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Tìm mã tương đương hoặc tên kỹ thuật..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
      </div>

      {/* Table */}
      {paged.length > 0 ? (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th rowSpan={2} className="px-2 py-2 text-left font-semibold w-8 border-r border-gray-700">#</th>
                <th rowSpan={2} className="px-2 py-2 text-left font-semibold min-w-[95px] border-r border-gray-700">Mã TĐ</th>
                <th rowSpan={2} className="px-3 py-2 text-left font-semibold min-w-[200px] border-r border-gray-700">Tên DVKT</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-semibold border-r border-b border-gray-700 bg-gray-900/80 text-gray-200">
                  Hiệu lực DVKT
                </th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold min-w-[95px] border-r border-gray-700">Đơn giá</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-semibold border-r border-b border-gray-700 bg-primary-950/80 text-primary-200">
                  Hiệu lực Chi phí
                </th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold min-w-[105px] border-r border-gray-700">CP Thuốc</th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold min-w-[105px] border-r border-gray-700">CP VTTH</th>
                <th rowSpan={2} className="px-2 py-2 text-center font-semibold w-24">Thao tác</th>
              </tr>
              <tr className="bg-gray-800 text-white text-[11px]">
                {/* DVKT validity subheaders */}
                <th className="px-2 py-1 text-center font-medium min-w-[85px] border-r border-gray-700 bg-gray-900/50">Từ</th>
                <th className="px-2 py-1 text-center font-medium min-w-[85px] border-r border-gray-700 bg-gray-900/50">Đến</th>
                {/* Cost validity subheaders */}
                <th className="px-2 py-1 text-center font-medium min-w-[95px] border-r border-gray-700 bg-primary-900/50 text-primary-100">Từ</th>
                <th className="px-2 py-1 text-center font-medium min-w-[95px] border-r border-gray-700 bg-primary-900/50 text-primary-100">Đến</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((item, idx) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-2 py-2 text-gray-400 border-r border-gray-100">{page * PAGE_SIZE + idx + 1}</td>
                    <td className="px-2 py-2 font-mono text-blue-700 font-semibold border-r border-gray-100">{item.maTuongDuong || '—'}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium border-r border-gray-100">{item.tenKT}</td>

                    {/* Hiệu lực DVKT (từ DM Giá) */}
                    <td className="px-2 py-2 text-center text-gray-600 border-r border-gray-100">
                      {item.dvktEffectiveFrom || item.effectiveFrom || '—'}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-600 border-r border-gray-100">
                      {item.dvktEffectiveTo ? (
                        item.dvktEffectiveTo
                      ) : (
                        <span className="text-emerald-600 font-medium">Hiện tại</span>
                      )}
                    </td>

                    {/* Đơn giá */}
                    <td className="px-2 py-2 text-right text-gray-700 font-medium border-r border-gray-100">
                      {fmtMoney(item.donGia)}
                    </td>

                    {/* Hiệu lực Chi phí (user quản lý) */}
                    <td className="px-2 py-2 text-center text-gray-600 border-r border-gray-100">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editCostFrom}
                          onChange={e => setEditCostFrom(e.target.value)}
                          className="w-28 px-1.5 py-0.5 text-xs text-center border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none"
                        />
                      ) : (
                        item.costEffectiveFrom || item.effectiveFrom || '—'
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-600 border-r border-gray-100">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="date"
                            value={editCostTo}
                            onChange={e => setEditCostTo(e.target.value)}
                            placeholder="Hiện tại"
                            className="w-28 px-1.5 py-0.5 text-xs text-center border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none"
                          />
                          {editCostTo && (
                            <button
                              type="button"
                              onClick={() => setEditCostTo('')}
                              title="Đặt là Hiện tại (không có ngày kết thúc)"
                              className="text-[11px] text-gray-400 hover:text-red-500 px-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        item.costEffectiveTo ? (
                          item.costEffectiveTo
                        ) : (
                          <span className="text-emerald-600 font-semibold">Hiện tại</span>
                        )
                      )}
                    </td>

                    {/* CP Thuốc */}
                    <td className="px-2 py-2 text-right border-r border-gray-100">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editMedicStr}
                          placeholder="0"
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '');
                            setEditMedicStr(digits ? Number(digits).toLocaleString('vi-VN') : '');
                          }}
                          className="w-24 px-1.5 py-0.5 text-xs text-right border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none font-medium"
                          autoFocus
                        />
                      ) : (
                        <span className={item.medicCost > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>
                          {fmtMoney(item.medicCost)}
                        </span>
                      )}
                    </td>

                    {/* CP VTTH */}
                    <td className="px-2 py-2 text-right border-r border-gray-100">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editVtthStr}
                          placeholder="0"
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '');
                            setEditVtthStr(digits ? Number(digits).toLocaleString('vi-VN') : '');
                          }}
                          className="w-24 px-1.5 py-0.5 text-xs text-right border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none font-medium"
                        />
                      ) : (
                        <span className={item.vtthCost > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>
                          {fmtMoney(item.vtthCost)}
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <>
                            <InstantTooltip content="Lưu thay đổi">
                              <button onClick={saveEdit} disabled={saving} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                            <InstantTooltip content="Hủy chỉnh sửa">
                              <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                          </>
                        ) : (
                          <>
                            <InstantTooltip content="Sửa chi phí thuốc/VTTH và hiệu lực chi phí">
                              <button onClick={() => startEdit(item)} className="p-1 text-primary-600 hover:bg-primary-50 rounded"><Edit3 className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                            <InstantTooltip content="Tạo phiên bản mới (clone với hiệu lực mới, tự đóng hiệu lực cũ)">
                              <button onClick={() => startDuplicate(item)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Copy className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                            <InstantTooltip content="Xóa khỏi DM chi phí (tự điều chỉnh khoảng hiệu lực)">
                              <button onClick={() => handleDelete(item.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400 text-sm">
          <p className="font-semibold">Chưa có mục chi phí nào</p>
          <p className="text-xs mt-1">Vào tab <strong>Danh mục giá</strong> → bật toggle để thêm kỹ thuật vào đây</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Trang {page + 1} / {totalPages} ({filtered.length} mục)</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="p-1 rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="p-1 rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
};
