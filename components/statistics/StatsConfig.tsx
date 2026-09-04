/**
 * StatsConfig — Configuration container with sub-tabs
 * Sub-tabs: Danh mục giá | Danh mục chương | Chi phí PTTT | Bảng giá nhân công PT/TT | ...
 */
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Download, Upload, Trash2, Edit3, Save, X, FileSpreadsheet,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  DollarSign, BookOpen, Briefcase, Users, SlidersHorizontal, TrendingDown, TrendingUp
} from 'lucide-react';
import {
  SurgeryPriceVersion,
  SurgeryNamePrice,
  SurgeryCostItem,
  ChapterCatalog,
  SurgeryProfile,
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
import { SurgeryNamePriceConfig } from './SurgeryNamePriceConfig';
import { ChapterCatalogConfig } from './ChapterCatalogConfig';
import { ProfileConfig } from './ProfileConfig';
import { SurgeryCostConfig } from './SurgeryCostConfig';
import { subscribeToCostItems } from '../../services/surgeryCostService';
import {
  getComparisonThresholdConfig,
  saveComparisonThresholdConfig,
  getSpecialtyOverrides,
  removeSpecialtyOverride,
  getAllSpecialties,
  getCustomSpecialties,
  saveCustomSpecialty,
  deleteCustomSpecialty,
  SpecialtyMeta,
  DEFAULT_SPECIALTIES,
  SpecialtyCode,
  ComparisonConfig
} from '../../services/specialtyComparisonService';
import { PlusCircle, Receipt } from 'lucide-react';

type ConfigSubTab = 'price-catalog' | 'chapter-catalog' | 'cost-catalog' | 'labor-price' | 'profile' | 'comparison-threshold';

const SUB_TAB_KEY = 'sdp_config_sub_tab';

interface Props {
  priceVersions: SurgeryPriceVersion[];
  surgeryNamePrices: SurgeryNamePrice[];
  chapters: ChapterCatalog[];
  profiles: SurgeryProfile[];
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

export const StatsConfig: React.FC<Props> = ({ priceVersions, surgeryNamePrices, chapters, profiles }) => {
  const [configSubTab, setConfigSubTab] = useState<ConfigSubTab>(() => {
    const saved = localStorage.getItem(SUB_TAB_KEY);
    return (saved as ConfigSubTab) || 'price-catalog';
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportedPriceData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cost items state (realtime from Firebase)
  const [costItems, setCostItems] = useState<SurgeryCostItem[]>([]);
  useEffect(() => {
    const unsub = subscribeToCostItems((items) => setCostItems(items));
    return () => unsub();
  }, []);

  // Threshold & Custom Specialties settings state
  const [thresholdForm, setThresholdForm] = useState<ComparisonConfig>(getComparisonThresholdConfig);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [overridesList, setOverridesList] = useState<Record<string, SpecialtyCode>>(getSpecialtyOverrides);
  const [customGroups, setCustomGroups] = useState<SpecialtyMeta[]>(getCustomSpecialties);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupShortName, setNewGroupShortName] = useState('');

  useEffect(() => {
    localStorage.setItem(SUB_TAB_KEY, configSubTab);
    if (configSubTab === 'comparison-threshold') {
      setThresholdForm(getComparisonThresholdConfig());
      setOverridesList(getSpecialtyOverrides());
      setCustomGroups(getCustomSpecialties());
    }
  }, [configSubTab]);

  const handleAddCustomGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      showToast('Vui lòng nhập tên nhóm chuyên khoa mới', 'error');
      return;
    }
    const created = saveCustomSpecialty(newGroupName, newGroupShortName);
    setCustomGroups(getCustomSpecialties());
    setNewGroupName('');
    setNewGroupShortName('');
    showToast(`Đã tạo nhóm chuyên khoa mới "${created.name}"`);
  };

  const handleDeleteCustomGroup = (code: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa nhóm "${name}"? Các kỹ thuật trong nhóm này sẽ trở về phân loại tự động.`)) {
      deleteCustomSpecialty(code);
      setCustomGroups(getCustomSpecialties());
      setOverridesList(getSpecialtyOverrides());
      showToast(`Đã xóa nhóm "${name}"`);
    }
  };

  const handleSaveThreshold = () => {
    if (thresholdForm.alertThreshold <= 0 || thresholdForm.positiveThreshold <= 0) {
      showToast('Ngưỡng phần trăm phải lớn hơn 0', 'error');
      return;
    }
    setThresholdSaving(true);
    try {
      saveComparisonThresholdConfig(thresholdForm);
      showToast('Đã lưu cấu hình ngưỡng phân tích thành công!');
    } catch (e: any) {
      showToast('Lỗi lưu cấu hình', 'error');
    } finally {
      setThresholdSaving(false);
    }
  };

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

  // --- Sub-tab definitions ---
  const subTabs: { key: ConfigSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'price-catalog', label: 'Danh mục giá', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { key: 'chapter-catalog', label: 'Danh mục chương', icon: <BookOpen className="h-3.5 w-3.5" /> },
    { key: 'cost-catalog', label: 'Chi phí PTTT', icon: <Receipt className="h-3.5 w-3.5" /> },
    { key: 'labor-price', label: 'Bảng giá nhân công', icon: <Briefcase className="h-3.5 w-3.5" /> },
    { key: 'profile', label: 'Profile', icon: <Users className="h-3.5 w-3.5" /> },
    { key: 'comparison-threshold', label: 'Ngưỡng phân tích', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px" aria-label="Config sub-tabs">
          {subTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setConfigSubTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                configSubTab === tab.key
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Sub-tab Content */}
      <div style={{ display: configSubTab === 'price-catalog' ? 'block' : 'none' }}>
        <SurgeryNamePriceConfig surgeryNamePrices={surgeryNamePrices} costItems={costItems} profiles={profiles} />
      </div>

      <div style={{ display: configSubTab === 'chapter-catalog' ? 'block' : 'none' }}>
        <ChapterCatalogConfig chapters={chapters} />
      </div>

      <div style={{ display: configSubTab === 'cost-catalog' ? 'block' : 'none' }}>
        <SurgeryCostConfig costItems={costItems} />
      </div>

      <div style={{ display: configSubTab === 'labor-price' ? 'block' : 'none' }}>
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
        <div className="space-y-6">
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
      </div>

      <div style={{ display: configSubTab === 'profile' ? 'block' : 'none' }}>
        <ProfileConfig profiles={profiles} surgeryNamePrices={surgeryNamePrices} />
      </div>

      {/* Threshold Config Sub-tab */}
      <div style={{ display: configSubTab === 'comparison-threshold' ? 'block' : 'none' }}>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-3xl">
          <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">Cấu hình Ngưỡng Phân tích So sánh Chuyên khoa</h3>
              <p className="text-xs text-gray-500">Tùy chỉnh tỷ lệ % tăng/giảm để tự động gán nhận định Cảnh báo hoặc Tích cực</p>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {/* Alert Threshold */}
            <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[#FCE4D6] text-[#C00000] border border-orange-200">
                    CẢNH BÁO
                  </span>
                  <label className="text-sm font-bold text-gray-800">Ngưỡng giảm để cảnh báo (%)</label>
                </div>
                <p className="text-xs text-gray-500 max-w-md">
                  Khi số ca phẫu thuật giảm từ mức này trở lên (so với tháng trước hoặc cùng kỳ năm trước), hoặc không phát sinh trong kỳ hiện tại.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-600">-</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={thresholdForm.alertThreshold}
                  onChange={(e) => setThresholdForm(prev => ({ ...prev, alertThreshold: Number(e.target.value) }))}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-right text-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 shadow-xs"
                />
                <span className="text-sm font-bold text-gray-600">%</span>
              </div>
            </div>

            {/* Positive Threshold */}
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[#E2EFDA] text-[#2E7D32] border border-emerald-200">
                    TÍCH CỰC
                  </span>
                  <label className="text-sm font-bold text-gray-800">Ngưỡng tăng để đánh giá tích cực (%)</label>
                </div>
                <p className="text-xs text-gray-500 max-w-md">
                  Khi số ca phẫu thuật tăng từ mức này trở lên (so với tháng trước hoặc cùng kỳ năm trước), hoặc mới phát sinh trong kỳ hiện tại.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-600">+</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={thresholdForm.positiveThreshold}
                  onChange={(e) => setThresholdForm(prev => ({ ...prev, positiveThreshold: Number(e.target.value) }))}
                  className="w-24 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-right text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-xs"
                />
                <span className="text-sm font-bold text-gray-600">%</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setThresholdForm({ alertThreshold: 10, positiveThreshold: 5 })}
                className="text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer"
              >
                Khôi phục mặc định (10% & 5%)
              </button>

              <button
                type="button"
                onClick={handleSaveThreshold}
                disabled={thresholdSaving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary-700 hover:bg-primary-800 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>{thresholdSaving ? 'Đang lưu...' : 'Lưu cấu hình ngưỡng'}</span>
              </button>
            </div>
          </div>

          {/* Custom Specialties Creation Section */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <span>Tạo nhóm chuyên khoa mới (Tùy chỉnh)</span>
                <span className="px-2 py-0.2 rounded-full text-[11px] bg-emerald-100 text-emerald-800 font-extrabold">
                  {customGroups.length} nhóm thêm mới
                </span>
              </h4>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Nhóm mới tạo chỉ nhận các kỹ thuật do bạn <strong>tự chuyển đến</strong> (ưu tiên hàng đầu trong phân loại, độc lập hoàn toàn với phân loại tự động).
            </p>

            {/* Form tạo nhóm mới */}
            <form onSubmit={handleAddCustomGroup} className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row items-end gap-3 mb-4">
              <div className="flex-1 w-full space-y-1">
                <label className="text-[11px] font-bold text-gray-700">Tên chuyên khoa mới *</label>
                <input
                  type="text"
                  placeholder="VD: Phẫu thuật Tạo hình - Thẩm mỹ, Răng Hàm Mặt..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="w-full sm:w-44 space-y-1">
                <label className="text-[11px] font-bold text-gray-700">Tên viết tắt (hiển thị nút/tab)</label>
                <input
                  type="text"
                  placeholder="VD: Thẩm mỹ, RHM..."
                  value={newGroupShortName}
                  onChange={(e) => setNewGroupShortName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Tạo nhóm</span>
              </button>
            </form>

            {/* Danh sách nhóm tùy chỉnh */}
            {customGroups.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-200 mb-6">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 font-bold text-gray-700">
                    <tr>
                      <th className="px-3 py-2">Tên nhóm chuyên khoa</th>
                      <th className="px-3 py-2 w-36">Tên viết tắt</th>
                      <th className="px-3 py-2 w-28">Phân loại</th>
                      <th className="px-3 py-2 w-20 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {customGroups.map((grp) => (
                      <tr key={grp.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-bold text-gray-800">{grp.name}</td>
                        <td className="px-3 py-2 text-gray-600 font-semibold">{grp.shortName}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            User tùy chỉnh
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomGroup(grp.code as string, grp.name)}
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Xóa nhóm này"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Custom Specialty Overrides Section */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <span>Danh mục kỹ thuật đã chuyển nhóm thủ công</span>
                <span className="px-2 py-0.2 rounded-full text-[11px] bg-primary-100 text-primary-800 font-extrabold">
                  {Object.keys(overridesList).length}
                </span>
              </h4>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Các kỹ thuật bạn đã dùng nút "Chuyển nhóm" trong bảng phân tích sẽ được ghi nhớ tại đây và tự động xếp vào chuyên khoa mới.
            </p>

            {Object.keys(overridesList).length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-400 italic">
                Chưa có kỹ thuật nào được chuyển nhóm thủ công. Bạn có thể chuyển nhóm trực tiếp trên từng dòng của bảng phân tích.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 font-bold text-gray-700">
                    <tr>
                      <th className="px-3 py-2">Tên kỹ thuật phẫu thuật</th>
                      <th className="px-3 py-2 w-48">Chuyên khoa đã gán</th>
                      <th className="px-3 py-2 w-20 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(overridesList).map(([tenKT, specCode]) => {
                      const allSpecs = getAllSpecialties();
                      const specMeta = allSpecs.find(s => s.code === specCode);
                      return (
                        <tr key={tenKT} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{tenKT}</td>
                          <td className="px-3 py-2 font-bold text-primary-800">
                            <span className="px-2 py-0.5 rounded bg-primary-50 border border-primary-200">
                              {specMeta?.name || specCode}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                removeSpecialtyOverride(tenKT);
                                setOverridesList(getSpecialtyOverrides());
                                showToast(`Đã xóa gán thủ công cho "${tenKT}"`);
                              }}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Khôi phục phân loại tự động"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
