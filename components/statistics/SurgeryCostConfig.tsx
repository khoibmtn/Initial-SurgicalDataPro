/**
 * SurgeryCostConfig — Tab "Chi phí PTTT"
 * Hiển thị DM chi phí: Mã TĐ, Tên DVKT, Hiệu lực, Đơn giá, Chi phí thuốc, VTTH
 * Inline edit, duplicate, delete, search, pagination, Excel export
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Download, Edit3, Save, X, Trash2, Copy, Plus,
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
const fmtMoney = (n: number) => n.toLocaleString('vi-VN') + ' ₫';

export const SurgeryCostConfig: React.FC<Props> = ({ costItems }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMedic, setEditMedic] = useState<number>(0);
  const [editVtth, setEditVtth] = useState<number>(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [dupId, setDupId] = useState<string | null>(null);
  const [dupDate, setDupDate] = useState('');
  const [saving, setSaving] = useState(false);

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
    setEditMedic(item.medicCost);
    setEditVtth(item.vtthCost);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMedic(0);
    setEditVtth(0);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (isNaN(editMedic) || editMedic <= 0) {
      showToast('Chi phí thuốc phải là số lớn hơn 0 (> 0)', 'error');
      return;
    }
    if (isNaN(editVtth) || editVtth <= 0) {
      showToast('Chi phí VTTH phải là số lớn hơn 0 (> 0)', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateCostItem(editingId, {
        medicCost: editMedic,
        vtthCost: editVtth,
      });
      showToast('Đã cập nhật chi phí');
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
      showToast('Đã xóa');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    }
  };

  // --- Duplicate ---
  const startDuplicate = (id: string) => {
    setDupId(id);
    setDupDate(new Date().toISOString().slice(0, 10));
  };

  const confirmDuplicate = async () => {
    if (!dupId || !dupDate) return;
    setSaving(true);
    try {
      await duplicateCostItem(dupId, dupDate, costItems);
      showToast('Đã tạo phiên bản mới. Phiên bản cũ tự đóng hiệu lực.');
      setDupId(null);
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
      {dupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Tạo phiên bản chi phí mới</h3>
            <p className="text-xs text-gray-500 mb-3">Phiên bản cũ sẽ tự đóng hiệu lực vào ngày trước ngày bắt đầu mới.</p>
            <label className="text-xs font-semibold text-gray-700">Hiệu lực từ ngày</label>
            <input
              type="date"
              value={dupDate}
              onChange={e => setDupDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setDupId(null); setDupDate(''); }} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">Hủy</button>
              <button onClick={confirmDuplicate} disabled={saving || !dupDate} className="px-4 py-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 rounded-lg disabled:opacity-50">
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
                <th className="px-2 py-2 text-left font-semibold w-8">#</th>
                <th className="px-2 py-2 text-left font-semibold min-w-[100px]">Mã TĐ</th>
                <th className="px-2 py-2 text-left font-semibold min-w-[200px]">Tên DVKT</th>
                <th className="px-2 py-2 text-center font-semibold min-w-[85px]">Từ</th>
                <th className="px-2 py-2 text-center font-semibold min-w-[85px]">Đến</th>
                <th className="px-2 py-2 text-right font-semibold min-w-[90px]">Đơn giá</th>
                <th className="px-2 py-2 text-right font-semibold min-w-[90px]">CP Thuốc</th>
                <th className="px-2 py-2 text-right font-semibold min-w-[90px]">CP VTTH</th>
                <th className="px-2 py-2 text-right font-semibold min-w-[100px]">Tổng CP</th>
                <th className="px-2 py-2 text-center font-semibold w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((item, idx) => {
                const isEditing = editingId === item.id;
                const total = item.donGia + (isEditing ? editMedic : item.medicCost) + (isEditing ? editVtth : item.vtthCost);
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-2 py-1.5 text-gray-400">{page * PAGE_SIZE + idx + 1}</td>
                    <td className="px-2 py-1.5 font-mono text-blue-700 font-semibold">{item.maTuongDuong || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-800 font-medium">{item.tenKT}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{item.effectiveFrom || '—'}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{item.effectiveTo || <span className="text-emerald-600 font-semibold">Hiện tại</span>}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{fmtMoney(item.donGia)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editMedic}
                          onChange={e => setEditMedic(Number(e.target.value))}
                          min={1}
                          className="w-20 px-1.5 py-0.5 text-xs text-right border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className={item.medicCost > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>{item.medicCost > 0 ? fmtMoney(item.medicCost) : '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editVtth}
                          onChange={e => setEditVtth(Number(e.target.value))}
                          min={1}
                          className="w-20 px-1.5 py-0.5 text-xs text-right border border-primary-300 rounded bg-primary-50 focus:ring-1 focus:ring-primary-500 outline-none"
                        />
                      ) : (
                        <span className={item.vtthCost > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>{item.vtthCost > 0 ? fmtMoney(item.vtthCost) : '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtMoney(total)}</td>
                    <td className="px-2 py-1.5 text-center">
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
                            <InstantTooltip content="Sửa chi phí thuốc/VTTH (phải > 0)">
                              <button onClick={() => startEdit(item)} className="p-1 text-primary-600 hover:bg-primary-50 rounded"><Edit3 className="h-3.5 w-3.5" /></button>
                            </InstantTooltip>
                            <InstantTooltip content="Tạo phiên bản mới (clone với hiệu lực mới, tự đóng hiệu lực cũ)">
                              <button onClick={() => startDuplicate(item.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Copy className="h-3.5 w-3.5" /></button>
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
