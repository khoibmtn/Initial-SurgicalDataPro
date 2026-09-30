/**
 * PositionCatalogConfig — Danh mục vị trí thống nhất cho gói dịch vụ
 * 
 * Cho phép thiết lập:
 * 1. Tên đầy đủ, Tên viết tắt
 * 2. Dropdown chọn ánh xạ từ cột trong cuộc mổ (PTV chính, PT phụ, BS GMHS, KTV gây mê, TDC, GV)
 * 3. Nếu KHÔNG chọn ánh xạ: Tùy chọn "Chỉ lấy nhân viên Ngoài PT" (chỉ hiện nhân viên nonSurgical khi gán gói)
 * 4. Thứ tự hiển thị và trạng thái kích hoạt
 */
import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Save,
  Trash2,
  XCircle,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Link2,
  UserCheck,
} from 'lucide-react';
import {
  PositionCatalogItem,
  SURGERY_MAPPING_OPTIONS,
  getSurgeryMappingLabel,
} from '../../types/servicePackage';
import {
  subscribeToPositionCatalog,
  savePositionItem,
  deletePositionItem,
  seedDefaultPositions,
} from '../../services/servicePackageService';

/**
 * Tự động tạo key từ label: bỏ dấu tiếng Việt, viết camelCase
 */
function generateKey(label: string): string {
  if (!label) return '';
  const stripped = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
}

const emptyForm = (): Omit<PositionCatalogItem, 'id' | 'createdAt' | 'updatedAt'> => ({
  key: '',
  label: '',
  shortLabel: '',
  group: 'non_surgical',
  isSurgeryParticipant: false,
  staffFilterKey: '',
  onlyNonSurgicalStaff: false,
  sortOrder: 99,
  active: true,
});

export const PositionCatalogConfig: React.FC = () => {
  const [positions, setPositions] = useState<PositionCatalogItem[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    seedDefaultPositions().catch(console.error);
    const unsub = subscribeToPositionCatalog(setPositions);
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!form.label.trim() || !form.shortLabel.trim()) {
      return;
    }
    try {
      const now = Date.now();
      const autoKey = editingId
        ? (positions.find(p => p.id === editingId)?.key || generateKey(form.label))
        : generateKey(form.label);

      const isSurgery = Boolean(form.staffFilterKey && form.staffFilterKey.trim() !== '');

      const item: PositionCatalogItem = {
        ...form,
        key: autoKey,
        isSurgeryParticipant: isSurgery,
        staffFilterKey: form.staffFilterKey || undefined,
        onlyNonSurgicalStaff: !isSurgery ? Boolean(form.onlyNonSurgicalStaff) : false,
        group: isSurgery ? 'support' : 'non_surgical',
        id: editingId || `pos_${autoKey}_${now}`,
        createdAt: editingId ? (positions.find(p => p.id === editingId)?.createdAt || now) : now,
        updatedAt: now,
      };

      await savePositionItem(item);
      setForm(emptyForm());
      setEditingId(null);
    } catch (error) {
      console.error('[PositionCatalog] Save failed:', error);
      alert('Lỗi lưu vị trí: ' + ((error as any)?.message || 'Unknown error'));
    }
  };

  const handleEdit = (p: PositionCatalogItem) => {
    setForm({
      key: p.key,
      label: p.label,
      shortLabel: p.shortLabel,
      group: p.group,
      isSurgeryParticipant: p.isSurgeryParticipant,
      staffFilterKey: p.staffFilterKey || '',
      onlyNonSurgicalStaff: Boolean(p.onlyNonSurgicalStaff),
      sortOrder: p.sortOrder,
      active: p.active,
    });
    setEditingId(p.id);
    setDeleteError(null);
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    const result = await deletePositionItem(id);
    if (!result.ok) {
      setDeleteError(result.reason || 'Không thể xóa');
    }
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setEditingId(null);
    setDeleteError(null);
  };

  return (
    <div className="space-y-4 font-inter">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <h4 className="font-semibold text-gray-800 text-sm">Danh mục vị trí</h4>
          <p className="text-[11px] text-gray-400">
            Quản lý vị trí trong gói dịch vụ phẫu thuật ({positions.length} vị trí)
          </p>
        </div>
      </div>

      {/* Form thêm / sửa vị trí */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm space-y-3">
        <div className="text-xs font-semibold text-gray-700 flex items-center justify-between">
          <span>{editingId ? 'Chỉnh sửa vị trí' : 'Thêm vị trí mới'}</span>
          {editingId && (
            <span className="text-[10px] text-teal-600 font-normal">
              Đang chỉnh sửa vị trí đã chọn
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Tên đầy đủ */}
          <div className="md:col-span-4">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">
              Tên đầy đủ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="VD: Điều dưỡng chuẩn bị BN phẫu thuật"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none h-[35px]"
            />
          </div>

          {/* Tên viết tắt */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">
              Viết tắt <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.shortLabel}
              onChange={(e) => setForm({ ...form, shortLabel: e.target.value })}
              placeholder="VD: Chuẩn bị PT"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none h-[35px]"
            />
          </div>

          {/* Ánh xạ cột trong ca mổ */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 flex items-center gap-1">
              <Link2 className="h-3 w-3 text-teal-600" />
              <span>Ánh xạ cột trong ca mổ</span>
            </label>
            <select
              value={form.staffFilterKey || ''}
              onChange={(e) => {
                const val = e.target.value;
                setForm({
                  ...form,
                  staffFilterKey: val,
                  isSurgeryParticipant: Boolean(val),
                  // Nếu chọn ánh xạ thì reset onlyNonSurgicalStaff về false
                  onlyNonSurgicalStaff: val ? false : form.onlyNonSurgicalStaff,
                });
              }}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none h-[35px] bg-white font-medium text-gray-700"
            >
              <option value="">— Không ánh xạ (Tự chọn NV) —</option>
              {SURGERY_MAPPING_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>
                  Cột: {opt.label} ({opt.key})
                </option>
              ))}
            </select>
          </div>

          {/* Tùy chọn: Chỉ lấy nhân viên Ngoài PT (khi không ánh xạ) */}
          <div className="md:col-span-2 flex items-center h-[35px]">
            {!form.staffFilterKey ? (
              <label
                className={`flex items-center gap-1.5 cursor-pointer select-none text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all w-full h-full ${
                  form.onlyNonSurgicalStaff
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="Khi gán gói, danh sách chọn nhân viên chỉ hiển thị những người được bật tùy chọn 'Ngoài PT'"
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.onlyNonSurgicalStaff)}
                  onChange={(e) => setForm({ ...form, onlyNonSurgicalStaff: e.target.checked })}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                />
                <span className="truncate">Chỉ NV Ngoài PT</span>
              </label>
            ) : (
              <div className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 h-full w-full">
                <UserCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">Tự lấy từ kíp mổ</span>
              </div>
            )}
          </div>

          {/* Thứ tự & Nút Lưu/Hủy */}
          <div className="md:col-span-1 flex items-center gap-1.5">
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              className="w-12 px-1 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none h-[35px] text-center"
              title="Thứ tự hiển thị"
            />
            <button
              onClick={handleSave}
              disabled={!form.label.trim() || !form.shortLabel.trim()}
              className="flex-1 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none text-white font-semibold rounded-lg text-xs transition-all flex items-center justify-center gap-1 shadow-sm h-[35px]"
              title={editingId ? 'Lưu cập nhật' : 'Thêm vị trí mới'}
            >
              {editingId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
            {editingId && (
              <button
                onClick={handleCancel}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors h-[35px] flex items-center justify-center shrink-0"
                title="Hủy bỏ chỉnh sửa"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {deleteError}
          <button
            onClick={() => setDeleteError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bảng danh sách vị trí */}
      <div className="overflow-hidden border border-gray-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2.5 w-12 text-center text-gray-500 font-semibold border-r border-gray-100">#</th>
              <th className="px-3 py-2.5 text-gray-700 font-semibold border-r border-gray-100">Tên đầy đủ</th>
              <th className="px-3 py-2.5 text-gray-600 font-semibold border-r border-gray-100 w-32">Viết tắt</th>
              <th className="px-3 py-2.5 text-gray-600 font-semibold border-r border-gray-100 w-52">Ánh xạ ca mổ / Nguồn NV</th>
              <th className="px-3 py-2.5 text-gray-500 font-semibold border-r border-gray-100 w-16 text-center">Thứ tự</th>
              <th className="px-3 py-2.5 text-gray-500 font-semibold border-r border-gray-100 w-20 text-center">Active</th>
              <th className="px-3 py-2.5 w-16 text-center text-gray-500 font-semibold">Xóa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400 italic text-sm">
                  Đang tải danh mục vị trí...
                </td>
              </tr>
            ) : (
              positions.map((p, idx) => (
                <tr
                  key={p.id}
                  onClick={() => handleEdit(p)}
                  className={`cursor-pointer transition-colors ${
                    editingId === p.id ? 'bg-teal-50/70 font-medium' : 'hover:bg-gray-50/70'
                  } ${!p.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-100 font-mono">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 font-semibold text-gray-800 border-r border-gray-100">
                    {p.label}
                  </td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100 font-medium">
                    {p.shortLabel}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    {p.staffFilterKey ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Link2 className="h-3 w-3" />
                        <span>Cột {getSurgeryMappingLabel(p.staffFilterKey)}</span>
                      </span>
                    ) : p.onlyNonSurgicalStaff ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <span>Chỉ NV Ngoài PT</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[11px] italic">
                        Tất cả nhân viên
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-500 border-r border-gray-100 font-mono">
                    {p.sortOrder}
                  </td>
                  <td className="px-3 py-2 text-center border-r border-gray-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        savePositionItem({ ...p, active: !p.active });
                      }}
                      className="p-0.5 transition-colors"
                      title={p.active ? 'Ẩn vị trí' : 'Hiện vị trí'}
                    >
                      {p.active ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-gray-300" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Xóa vị trí"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
