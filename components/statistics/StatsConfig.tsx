/**
 * StatsConfig — Price version management UI
 * CRUD + Excel import/export + overlap validation
 */
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Download, Upload, Trash2, Edit3, Save, X, FileSpreadsheet,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  SurgeryPriceVersion,
  LOAI_PTTT_ORDER,
  LOAI_PTTT_LABELS,
} from '../../types';
import {
  createPriceVersion,
  updatePriceVersion,
  deletePriceVersion,
  exportPriceTemplate,
  exportPriceVersion,
  parseImportedPriceExcel,
  validatePriceVersionOverlap,
  validatePrices,
  ImportedPriceData,
} from '../../services/pricingService';

interface Props {
  priceVersions: SurgeryPriceVersion[];
}

interface FormState {
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  note: string;
  prices: Record<string, number>;
}

const EMPTY_FORM: FormState = {
  name: '',
  effectiveFrom: '',
  effectiveTo: '',
  note: '',
  prices: Object.fromEntries(LOAI_PTTT_ORDER.map(c => [c, 0])),
};

function toFormState(v: SurgeryPriceVersion): FormState {
  return {
    name: v.name,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo || '',
    note: v.note,
    prices: { ...EMPTY_FORM.prices, ...v.prices },
  };
}

const fmtMoney = (n: number) => n.toLocaleString('vi-VN') + ' ₫';

export const StatsConfig: React.FC<Props> = ({ priceVersions }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportedPriceData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Handlers ---
  const handleStartNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setImportPreview(null);
  };

  const handleStartEdit = (v: SurgeryPriceVersion) => {
    setForm(toFormState(v));
    setEditingId(v.id);
    setShowForm(true);
    setImportPreview(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImportPreview(null);
  };

  const handleSave = async () => {
    // Validate prices
    const priceErrors = validatePrices(form.prices);
    if (priceErrors.length > 0) {
      showToast(priceErrors[0], 'error');
      return;
    }

    if (!form.name.trim()) {
      showToast('Vui lòng nhập tên bảng giá', 'error');
      return;
    }
    if (!form.effectiveFrom) {
      showToast('Vui lòng nhập ngày hiệu lực', 'error');
      return;
    }

    // Validate overlap
    const overlapError = validatePriceVersionOverlap(
      {
        name: form.name,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        note: form.note,
        prices: form.prices,
      },
      priceVersions,
      editingId || undefined
    );

    if (overlapError) {
      showToast(overlapError, 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        note: form.note.trim(),
        prices: form.prices,
      };

      if (editingId) {
        await updatePriceVersion(editingId, data);
        showToast('Đã cập nhật bảng giá');
      } else {
        await createPriceVersion(data);
        showToast('Đã tạo bảng giá mới');
      }
      handleCancel();
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu bảng giá', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: SurgeryPriceVersion) => {
    if (!window.confirm(`Xác nhận xóa bảng giá "${v.name}"?`)) return;
    try {
      await deletePriceVersion(v.id);
      showToast('Đã xóa bảng giá');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    }
  };

  // Excel import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseImportedPriceExcel(wb);
        setImportPreview(parsed);

        if (parsed.errors.length === 0) {
          setForm({
            name: parsed.name,
            effectiveFrom: parsed.effectiveFrom,
            effectiveTo: parsed.effectiveTo || '',
            note: parsed.note,
            prices: { ...EMPTY_FORM.prices, ...parsed.prices },
          });
          setEditingId(null);
          setShowForm(true);
        }
      } catch (err) {
        showToast('Không thể đọc file Excel', 'error');
      }
    };
    reader.readAsArrayBuffer(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">Bảng giá dịch vụ PT/TT</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPriceTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Excel mẫu
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Import Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
          <button
            onClick={handleStartNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Tạo mới
          </button>
        </div>
      </div>

      {/* Import Preview Errors */}
      {importPreview && importPreview.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Lỗi import Excel
          </p>
          <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
            {importPreview.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white border-2 border-primary-200 rounded-xl p-4 space-y-4 shadow-sm">
          <h4 className="text-sm font-bold text-primary-800">
            {editingId ? '✏️ Chỉnh sửa bảng giá' : '➕ Tạo bảng giá mới'}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Tên bảng giá *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="VD: Bảng giá theo QĐ 123/2024"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Ghi chú</label>
              <input
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ghi chú tùy chọn"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Hiệu lực từ *</label>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Kết thúc (trống = đang áp dụng)</label>
              <input
                type="date"
                value={form.effectiveTo}
                onChange={e => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Price grid */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">Đơn giá dịch vụ (VNĐ) *</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {LOAI_PTTT_ORDER.map(code => (
                <div key={code} className="bg-gray-50 rounded-lg p-2">
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">{code}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.prices[code] || ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      prices: { ...f.prices, [code]: Number(e.target.value) || 0 }
                    }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo mới'}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Price Versions List */}
      <div className="space-y-3">
        {priceVersions.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <FileSpreadsheet className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Chưa có bảng giá nào</p>
            <p className="text-xs text-gray-400 mt-1">Tạo mới hoặc import từ Excel</p>
          </div>
        ) : (
          priceVersions.map(v => {
            const isExpanded = expandedId === v.id;
            const isActive = !v.effectiveTo || v.effectiveTo >= new Date().toISOString().split('T')[0];

            return (
              <div key={v.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Header */}
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{v.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isActive ? 'Đang áp dụng' : 'Hết hiệu lực'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.effectiveFrom} → {v.effectiveTo || 'Hiện tại'}
                        {v.note && <span className="ml-2 text-gray-400">• {v.note}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => exportPriceVersion(v)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Xuất Excel"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleStartEdit(v)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Sửa"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(v)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded: Price table */}
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-gray-100">
                    <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                      {LOAI_PTTT_ORDER.map(code => (
                        <div key={code} className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-[10px] font-bold text-gray-500">{code}</p>
                          <p className="text-xs font-semibold text-gray-800 mt-1">{fmtMoney(v.prices[code] ?? 0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
