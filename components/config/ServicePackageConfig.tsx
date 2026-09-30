/**
 * ServicePackageConfig — Cấu hình gói dịch vụ
 * CRUD gói: tên, tổng tiền, danh sách vị trí + số tiền, active/disable
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Package, Plus, Save, Trash2, XCircle, AlertTriangle, ToggleLeft, ToggleRight, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import {
  PositionCatalogItem,
  ServicePackageDefinition,
  ServicePackagePosition,
  getSurgeryMappingLabel,
} from '../../types/servicePackage';
import {
  subscribeToPositionCatalog,
  subscribeToServicePackages,
  saveServicePackage,
  toggleServicePackageActive,
  deleteServicePackage,
} from '../../services/servicePackageService';

function formatVND(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

interface PackageFormState {
  name: string;
  shortName: string;
  totalAmount: number;
  positions: ServicePackagePosition[];
  note: string;
  sortOrder: number;
  active: boolean;
}

const emptyForm = (): PackageFormState => ({
  name: '',
  shortName: '',
  totalAmount: 0,
  positions: [],
  note: '',
  sortOrder: 1,
  active: true,
});

export const ServicePackageConfig: React.FC = () => {
  const [positionCatalog, setPositionCatalog] = useState<PositionCatalogItem[]>([]);
  const [packages, setPackages] = useState<ServicePackageDefinition[]>([]);
  const [form, setForm] = useState<PackageFormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeToPositionCatalog(setPositionCatalog);
    const unsub2 = subscribeToServicePackages(setPackages);
    return () => { unsub1(); unsub2(); };
  }, []);

  const activePositions = useMemo(() => positionCatalog.filter(p => p.active), [positionCatalog]);

  const positionsSum = useMemo(() => form.positions.reduce((s, p) => s + p.amount, 0), [form.positions]);

  const handleAddPosition = (pos: PositionCatalogItem) => {
    if (form.positions.some(p => p.positionKey === pos.key)) return;
    setForm({
      ...form,
      positions: [...form.positions, {
        positionId: pos.id,
        positionKey: pos.key,
        positionLabel: pos.shortLabel,
        amount: 0,
      }],
    });
  };

  const handleRemovePosition = (posKey: string) => {
    setForm({ ...form, positions: form.positions.filter(p => p.positionKey !== posKey) });
  };

  const handlePositionAmountChange = (posKey: string, amount: number) => {
    setForm({
      ...form,
      positions: form.positions.map(p => p.positionKey === posKey ? { ...p, amount } : p),
    });
  };

  const handleSave = async () => {
    console.log('[ServicePackageConfig] handleSave called, form:', form);
    if (!form.name.trim()) {
      console.warn('[ServicePackageConfig] Validation failed: name empty');
      return;
    }
    setError(null);
    try {
      const now = Date.now();
      const pkg: ServicePackageDefinition = {
        id: editingId || '',
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        totalAmount: form.totalAmount,
        positions: form.positions,
        active: form.active,
        sortOrder: form.sortOrder,
        note: form.note,
        createdAt: editingId ? (packages.find(p => p.id === editingId)?.createdAt || now) : now,
        updatedAt: now,
      };
      console.log('[ServicePackageConfig] Saving pkg:', pkg);
      await saveServicePackage(pkg);
      console.log('[ServicePackageConfig] Save completed!');
      setForm(emptyForm());
      setEditingId(null);
      setShowForm(false);
    } catch (error) {
      console.error('[ServicePackageConfig] Save FAILED:', error);
      setError('Lỗi lưu gói: ' + ((error as any)?.message || 'Unknown error'));
    }
  };

  const handleEdit = (pkg: ServicePackageDefinition) => {
    setForm({
      name: pkg.name,
      shortName: pkg.shortName || '',
      totalAmount: pkg.totalAmount,
      positions: [...pkg.positions],
      note: pkg.note || '',
      sortOrder: pkg.sortOrder,
      active: pkg.active,
    });
    setEditingId(pkg.id);
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const result = await deleteServicePackage(id);
    if (!result.ok) setError(result.reason || 'Không thể xóa');
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  const availableToAdd = activePositions.filter(ap => !form.positions.some(fp => fp.positionKey === ap.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Package className="h-4 w-4" /></div>
          <div>
            <h4 className="font-semibold text-gray-800 text-sm">Cấu hình gói dịch vụ</h4>
            <p className="text-[11px] text-gray-400">{packages.length} gói đã thiết lập</p>
          </div>
        </div>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }} className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm">
            <Plus className="h-3.5 w-3.5" /> Thêm gói mới
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><XCircle className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border-2 border-indigo-200 p-4 shadow-sm space-y-3">
          <div className="text-xs font-semibold text-indigo-700">{editingId ? '✏️ Chỉnh sửa gói' : '➕ Tạo gói mới'}</div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Tên gói <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Phẫu thuật chọn bác sĩ" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none h-[35px]" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Tên rút gọn (hiển thị bảng)</label>
              <input type="text" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} placeholder="BS yêu cầu" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none h-[35px]" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Tổng số tiền gói (VNĐ)</label>
              <input type="number" value={form.totalAmount || ''} onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) || 0 })} placeholder="2000000" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 outline-none h-[35px]" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Thứ tự</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none h-[35px] text-center" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Ghi chú</label>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú thêm..." className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none h-[35px]" />
          </div>

          {/* Positions in package */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400">Vị trí trong gói ({form.positions.length})</span>
              {positionsSum !== form.totalAmount && form.totalAmount > 0 && (
                <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Tổng vị trí ({formatVND(positionsSum)}) ≠ Tổng gói ({formatVND(form.totalAmount)})
                </span>
              )}
            </div>

            {form.positions.map(fp => {
              const catItem = positionCatalog.find(p => p.key === fp.positionKey);
              const fullLabel = catItem?.label || fp.positionLabel;
              const shortLabel = catItem?.shortLabel || fp.positionLabel;
              const mapLabel = catItem?.staffFilterKey
                ? `Ánh xạ: ${getSurgeryMappingLabel(catItem.staffFilterKey)}`
                : catItem?.onlyNonSurgicalStaff
                ? 'Chỉ NV Ngoài PT'
                : 'Tất cả nhân viên';

              return (
                <div key={fp.positionKey} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                  <div className="w-52 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-800">{shortLabel}</span>
                      <span className="text-[10px] font-mono text-gray-400">({fp.positionKey})</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate" title={fullLabel}>{fullLabel}</div>
                  </div>
                  <div className="w-40 shrink-0">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      catItem?.staffFilterKey
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : catItem?.onlyNonSurgicalStaff
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {mapLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-1">
                    <DollarSign className="h-3 w-3 text-gray-400" />
                    <input
                      type="number"
                      value={fp.amount || ''}
                      onChange={(e) => handlePositionAmountChange(fp.positionKey, Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-32 px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-gray-400">đ</span>
                  </div>
                  <button onClick={() => handleRemovePosition(fp.positionKey)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><XCircle className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}

            {/* Add position dropdown */}
            {availableToAdd.length > 0 && (
              <div className="flex items-center gap-2">
                <select onChange={(e) => {
                  const pos = activePositions.find(p => p.key === e.target.value);
                  if (pos) handleAddPosition(pos);
                  e.target.value = '';
                }} className="flex-1 px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white h-[35px]">
                  <option value="">+ Thêm vị trí vào gói...</option>
                  {availableToAdd.map(p => {
                    const mapStr = p.staffFilterKey
                      ? `Ánh xạ: ${getSurgeryMappingLabel(p.staffFilterKey)}`
                      : p.onlyNonSurgicalStaff
                      ? 'Chỉ NV Ngoài PT'
                      : 'Tất cả NV';
                    return (
                      <option key={p.key} value={p.key}>
                        [{p.shortLabel}] {p.label} ({mapStr})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={handleSave} disabled={!form.name.trim()} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm">
              <Save className="h-3.5 w-3.5" /> {editingId ? 'Cập nhật' : 'Tạo gói'}
            </button>
            <button onClick={handleCancel} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 font-medium rounded-lg text-xs transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Package List */}
      <div className="space-y-2">
        {packages.map(pkg => (
          <div key={pkg.id} className={`border rounded-xl overflow-hidden transition-all ${pkg.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
            <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50/50" onClick={() => setExpandedPkgId(expandedPkgId === pkg.id ? null : pkg.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{pkg.name}</span>
                  {pkg.shortName && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-100">
                      Rút gọn: {pkg.shortName}
                    </span>
                  )}
                  {!pkg.active && <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[9px] font-semibold rounded-full">ẨN</span>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                  <span className="font-mono font-semibold text-indigo-600">{formatVND(pkg.totalAmount)}</span>
                  <span>{pkg.positions.length} vị trí</span>
                  {pkg.note && <span>· {pkg.note}</span>}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); toggleServicePackageActive(pkg.id, !pkg.active); }} className="p-0.5 transition-colors" title={pkg.active ? 'Ẩn gói' : 'Bật gói'}>
                {pkg.active ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleEdit(pkg); }} className="px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-medium">
                Sửa
              </button>
              <button onClick={(e) => { e.stopPropagation(); if (confirm('Xóa gói này?')) handleDelete(pkg.id); }} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {expandedPkgId === pkg.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
            {expandedPkgId === pkg.id && pkg.positions.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2 bg-gray-50/50">
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-400 font-semibold border-b border-gray-200">
                    <th className="text-left py-1.5">Tên viết tắt</th>
                    <th className="text-left py-1.5">Tên đầy đủ</th>
                    <th className="text-left py-1.5 w-36">Nguồn ánh xạ</th>
                    <th className="text-left py-1.5 w-24 font-mono">Key</th>
                    <th className="text-right py-1.5 w-32">Số tiền</th>
                  </tr></thead>
                  <tbody>
                    {pkg.positions.map(p => {
                      const catItem = positionCatalog.find(c => c.key === p.positionKey);
                      const mapLabel = catItem?.staffFilterKey
                        ? `Ánh xạ: ${getSurgeryMappingLabel(catItem.staffFilterKey)}`
                        : catItem?.onlyNonSurgicalStaff
                        ? 'Chỉ NV Ngoài PT'
                        : 'Tất cả nhân viên';
                      return (
                        <tr key={p.positionKey} className="border-t border-gray-100/80">
                          <td className="py-1.5 font-semibold text-gray-800">{p.positionLabel}</td>
                          <td className="py-1.5 text-gray-600">{catItem?.label || '—'}</td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              catItem?.staffFilterKey
                                ? 'bg-blue-50 text-blue-700'
                                : catItem?.onlyNonSurgicalStaff
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {mapLabel}
                            </span>
                          </td>
                          <td className="py-1.5 font-mono text-gray-400">{p.positionKey}</td>
                          <td className="py-1.5 text-right font-mono text-indigo-600 font-semibold">{formatVND(p.amount)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gray-200 font-bold">
                      <td colSpan={4} className="py-1.5 text-gray-600">Tổng cộng</td>
                      <td className="py-1.5 text-right font-mono text-indigo-700">{formatVND(pkg.positions.reduce((s, p) => s + p.amount, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {packages.length === 0 && !showForm && (
          <div className="text-center py-10 text-gray-400 text-sm italic">Chưa có gói dịch vụ nào. Bấm "Thêm gói mới" để bắt đầu.</div>
        )}
      </div>
    </div>
  );
};
