/**
 * PackageAssignmentModal — Modal chọn gói DV + nhân sự cho cuộc mổ
 * 
 * Flow:
 * 1. Chọn gói dịch vụ (dropdown active packages)
 * 2. Auto-fill nhân sự từ SurgeryRecord cho vị trí có staffFilterKey
 * 3. User chọn nhân sự qua Combobox tiêu chuẩn (lọc gõ, bàn phím di chuyển, chọn trong danh sách hoặc để trống)
 * 4. Lưu ServicePackageAssignment vào Firestore online ngay lập tức
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, Package, User, Lock } from 'lucide-react';
import {
  PositionCatalogItem,
  ServicePackageDefinition,
  ServicePackageAssignment,
  PackageStaffAssignment,
  ServicePackageModuleConfig,
  DEFAULT_MODULE_CONFIG,
  buildCompositeKey,
  getRecordDateString,
  getSurgeryMappingLabel,
  LS_DRAFT_KEY,
} from '../../types/servicePackage';
import { SurgeryRecord, StaffMember } from '../../types';
import {
  subscribeToPositionCatalog,
  subscribeToServicePackages,
  subscribeToModuleConfig,
  saveAssignment,
} from '../../services/servicePackageService';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent } from '../../services/auditLogService';
import { isAuthOrPermissionError, openAuthModal } from '../../utils/authGuidance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The surgery records being assigned to a package (could be 1 or merged) */
  records: SurgeryRecord[];
  /** All staff members */
  staffList: StaffMember[];
  /** Existing assignment (if editing) */
  existingAssignment?: ServicePackageAssignment | null;
  /** Callback after save */
  onSaved?: (assignment: ServicePackageAssignment) => void;
}

function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

function formatVND(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

// ─── Standard Accessible Staff Combobox ──────────────────────────────────────

interface StaffComboboxProps {
  value: string;
  onChange: (val: string) => void;
  options: StaffMember[];
  placeholder?: string;
  isAuto?: boolean;
}

const StaffCombobox: React.FC<StaffComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Chọn hoặc gõ tên nhân sự...',
  isAuto = false,
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const clearSelection = () => {
    if (value) onChange('');
    setInputValue('');
    setIsOpen(false);
  };

  // Commit on blur: empty input => blank; exact match => select; otherwise revert
  const commitInput = () => {
    const normInput = removeVietnameseTones(inputValue);
    if (!normInput) {
      if (value) onChange('');
      setInputValue('');
    } else {
      const matched = options.find(o => removeVietnameseTones(o.name) === normInput);
      if (matched) {
        if (matched.name !== value) onChange(matched.name);
        setInputValue(matched.name);
      } else {
        setInputValue(value || '');
      }
    }
    setIsOpen(false);
  };

  const filtered = useMemo(() => {
    const term = removeVietnameseTones(inputValue);
    // Show full list when empty or when input just mirrors the current selection
    if (!term || term === removeVietnameseTones(value || '')) return options.slice(0, 40);
    return options
      .filter(o => {
        const nameMatch = removeVietnameseTones(o.name).includes(term);
        const deptMatch = removeVietnameseTones(o.department || '').includes(term);
        const posMatch = removeVietnameseTones(o.position || '').includes(term);
        return nameMatch || deptMatch || posMatch;
      })
      .slice(0, 40);
  }, [options, inputValue]);

  // Keep highlighted item in view
  useEffect(() => {
    if (isOpen && listRef.current && listRef.current.children[highlightedIndex]) {
      const itemEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectOption = (name: string) => {
    onChange(name);
    setInputValue(name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex(prev => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(Math.max(0, filtered.length - 1));
      } else {
        setHighlightedIndex(prev => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!inputValue.trim() && value) {
        // User emptied the field deliberately => leave blank
        clearSelection();
      } else if (isOpen && filtered.length > 0 && filtered[highlightedIndex]) {
        selectOption(filtered[highlightedIndex].name);
      } else if (filtered.length === 1) {
        selectOption(filtered[0].name);
      } else {
        // Revert to original value
        setInputValue(value || '');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(value || '');
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitInput();
      }}
    >
      <div className="relative flex items-center">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 pr-14 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white text-gray-800 placeholder-gray-400 shadow-sm"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {inputValue && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearSelection}
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
              title="Xóa lựa chọn"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {isAuto && (
            <span className="text-[9px] text-emerald-600 font-semibold px-1 py-0.5 bg-emerald-50 rounded border border-emerald-200">
              auto
            </span>
          )}
        </div>
      </div>

      {/* Combobox Dropdown */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {value && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                clearSelection();
              }}
              className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer text-xs italic text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors border-b border-gray-100"
            >
              <X className="h-3 w-3" />
              Để trống (xóa lựa chọn)
            </div>
          )}
          <div ref={listRef} className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 italic text-center">
              Không tìm thấy nhân viên trong danh sách
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = item.name === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={item.id || item.name + idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(item.name);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                    isHighlighted ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`truncate ${isSelected ? 'font-bold text-teal-700' : 'font-medium'}`}>
                      {item.name}
                    </span>
                    {(item.position || item.department) && (
                      <span className="text-[10px] text-gray-400 truncate">
                        ({[item.position, item.department].filter(Boolean).join(' - ')})
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-teal-600 text-xs font-bold shrink-0 ml-2">✓</span>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Modal Component ────────────────────────────────────────────────────

export const PackageAssignmentModal: React.FC<Props> = ({
  isOpen, onClose, records, staffList, existingAssignment, onSaved,
}) => {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PositionCatalogItem[]>([]);
  const [packages, setPackages] = useState<ServicePackageDefinition[]>([]);
  const [moduleConfig, setModuleConfig] = useState<ServicePackageModuleConfig>(DEFAULT_MODULE_CONFIG);
  const [selectedPkgId, setSelectedPkgId] = useState<string>('');
  const [staffMap, setStaffMap] = useState<Record<string, string>>({}); // positionKey → staffName
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-fill runs once per (package, record) so cleared cells are not refilled
  const autoFillDoneRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) return;
    const unsub1 = subscribeToPositionCatalog(setPositions);
    const unsub2 = subscribeToServicePackages(setPackages);
    const unsub3 = subscribeToModuleConfig(setModuleConfig);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [isOpen]);

  // Pre-fill from existing assignment or initialize
  useEffect(() => {
    if (!isOpen) {
      autoFillDoneRef.current = '';
      return;
    }
    if (existingAssignment) {
      setSelectedPkgId(existingAssignment.packageId);
      const map: Record<string, string> = {};
      existingAssignment.staffAssignments.forEach(sa => {
        if (sa.staffName && sa.staffName.trim()) {
          map[sa.positionKey] = sa.staffName.trim();
        }
      });
      setStaffMap(map);
    } else {
      setSelectedPkgId('');
      setStaffMap({});
    }
  }, [existingAssignment, isOpen]);

  const activePackages = useMemo(() => packages.filter(p => p.active), [packages]);
  const selectedPkg = useMemo(() => packages.find(p => p.id === selectedPkgId), [packages, selectedPkgId]);

  // Default to first active package if none selected (for new assignment)
  useEffect(() => {
    if (!isOpen) return;
    if (!existingAssignment && !selectedPkgId && activePackages.length > 0) {
      setSelectedPkgId(activePackages[0].id);
    }
  }, [isOpen, existingAssignment, selectedPkgId, activePackages]);

  // When package or record is ready, auto-fill staff from the record once.
  // Positions already saved in an existing assignment (even blank) are respected.
  useEffect(() => {
    if (!isOpen || !selectedPkg || positions.length === 0) return;
    const rec = records[0];
    if (!rec) return;

    const fillKey = `${selectedPkg.id}|${rec.key || rec.id || rec.patientId}`;
    if (autoFillDoneRef.current === fillKey) return;
    autoFillDoneRef.current = fillKey;

    const savedKeys = new Set(
      existingAssignment && existingAssignment.packageId === selectedPkg.id
        ? existingAssignment.staffAssignments.map(sa => sa.positionKey)
        : []
    );

    setStaffMap(prev => {
      const next = { ...prev };
      let changed = false;
      for (const pos of selectedPkg.positions) {
        if (savedKeys.has(pos.positionKey)) continue;
        // Auto-fill if position is currently blank or not set
        if (!next[pos.positionKey] || next[pos.positionKey].trim() === '') {
          const catalogItem = positions.find(p => p.key === pos.positionKey);
          if (catalogItem?.staffFilterKey) {
            const fieldVal = (rec as any)[catalogItem.staffFilterKey];
            if (fieldVal && String(fieldVal).trim() !== '') {
              next[pos.positionKey] = String(fieldVal).trim();
              changed = true;
            }
          }
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, selectedPkg, records, positions, existingAssignment]);

  const getStaffOptions = (posKey: string): StaffMember[] => {
    const catalogItem = positions.find(p => p.key === posKey);
    if (!catalogItem) return staffList;

    // 1. Nếu vị trí được ánh xạ từ cột phẫu thuật
    if (catalogItem.staffFilterKey) {
      switch (catalogItem.staffFilterKey) {
        case 'ptChinh':
        case 'ptPhu':
          return staffList.filter(s => s.position === 'BS PT');
        case 'bsGM':
          return staffList.filter(s => s.position === 'BS GMHS');
        case 'ktvGM':
        case 'tdc':
          return staffList.filter(s => s.position === 'Phụ' || s.position === 'BS GMHS');
        case 'gv':
          return staffList.filter(s => s.position === 'Phụ' || s.nonSurgical);
        default:
          return staffList;
      }
    }

    // 2. Nếu vị trí KHÔNG ánh xạ và bật tùy chọn "Chỉ lấy nhân viên Ngoài PT"
    if (catalogItem.onlyNonSurgicalStaff) {
      return staffList.filter(s => s.nonSurgical);
    }

    // 3. Nếu vị trí không ánh xạ và không giới hạn Ngoài PT: hiện tất cả nhân viên
    return staffList;
  };

  const isAutoFilled = (posKey: string): boolean => {
    const catalogItem = positions.find(p => p.key === posKey);
    return !!(catalogItem?.staffFilterKey && staffMap[posKey]);
  };

  const isLocked = (posKey: string): boolean => {
    return isAutoFilled(posKey) && !moduleConfig.allowOverrideAutoFilledStaff;
  };

  const handleSave = async () => {
    if (!selectedPkg || !records.length) return;
    setSaving(true);
    try {
      const rec = records[0];
      const staffAssignments: PackageStaffAssignment[] = selectedPkg.positions.map(pos => ({
        positionId: pos.positionId,
        positionKey: pos.positionKey,
        positionLabel: pos.positionLabel,
        staffName: staffMap[pos.positionKey] || '',
        amount: pos.amount,
        autoFilled: isAutoFilled(pos.positionKey),
      }));

      const recDateStr = getRecordDateString(rec);
      const compositeKey = buildCompositeKey(rec.patientId, recDateStr, rec.tenKT);
      const assignment: ServicePackageAssignment = {
        id: existingAssignment?.id || '',
        patientId: rec.patientId,
        ngayBD: recDateStr || rec.ngayBD || '',
        tenKT: rec.tenKT,
        compositeKey,
        patientName: rec.patientName,
        gender: rec.gender,
        yob: rec.yob,
        packageId: selectedPkg.id,
        packageName: selectedPkg.name,
        packageShortName: selectedPkg.shortName?.trim() || '',
        staffAssignments,
        linkedSurgeryKeys: records.map(r => r.key || r.id || `${r.patientId}_${r.stt}`).filter(Boolean),
        createdAt: existingAssignment?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      setError(null);
      let id: string;
      try {
        id = await saveAssignment(assignment);
        assignment.id = id;
      } catch (saveErr) {
        console.error('Failed to save assignment:', saveErr);
        if (isAuthOrPermissionError(saveErr) || !user) {
          setError('Bạn cần đăng nhập để gán gói dịch vụ. Vui lòng đăng nhập hoặc tạo tài khoản mới.');
        } else {
          setError(saveErr instanceof Error ? saveErr.message : 'Không thể lưu gán gói dịch vụ.');
        }
        return;
      }

      if (user) {
        logAuditEvent({
          userId: user.uid,
          userName: user.displayName || user.nickname || 'Người dùng',
          userRole: user.role,
          userDepartment: user.department,
          action: 'PACKAGE_ASSIGNMENT_EDIT',
          targetType: 'service_package',
          targetId: id,
          targetLabel: `Gói ${selectedPkg.name} - BN ${rec.patientName}`,
          periodKey: assignment.ngayBD ? assignment.ngayBD.slice(0, 7) : undefined,
          description: `Gán gói dịch vụ "${selectedPkg.name}" cho bệnh nhân ${rec.patientName} (${rec.patientId || ''})`,
        }).catch((e) => console.warn('[auditLog] Failed to log package assignment:', e));
      }

      // Remove from local draft records once assigned and saved online
      try {
        const stored = localStorage.getItem(LS_DRAFT_KEY);
        if (stored) {
          const drafts: SurgeryRecord[] = JSON.parse(stored);
          const filtered = drafts.filter(d => {
            const dDate = getRecordDateString(d).substring(0, 10);
            const dKey = buildCompositeKey(d.patientId || '', dDate, d.tenKT || '');
            return dKey !== compositeKey && d.id !== rec.id && d.key !== rec.key;
          });
          localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(filtered));
          window.dispatchEvent(new Event('package_drafts_updated'));
        }
      } catch (err) {
        console.error('Failed to update package drafts:', err);
      }

      onSaved?.(assignment);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <Package className="h-5 w-5 text-teal-600" />
            <div>
              <h3 className="text-sm font-bold text-gray-800">Gán gói dịch vụ</h3>
              {records[0] && (
                <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                  {records[0].patientName} — {records[0].tenKT}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Package selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Chọn gói dịch vụ</label>
            <select
              value={selectedPkgId}
              onChange={(e) => { setSelectedPkgId(e.target.value); setStaffMap({}); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none bg-white"
            >
              <option value="">-- Chọn gói --</option>
              {activePackages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.shortName ? ` (${p.shortName})` : ''} — {formatVND(p.totalAmount)}
                </option>
              ))}
            </select>
          </div>

          {/* Staff assignment per position */}
          {selectedPkg && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 flex items-center justify-between">
                <span>Phân công nhân sự ({selectedPkg.positions.length} vị trí)</span>
                <span className="font-mono text-teal-700 font-bold">{formatVND(selectedPkg.totalAmount)}</span>
              </div>
              {selectedPkg.positions.map(pos => {
                const locked = isLocked(pos.positionKey);
                const auto = isAutoFilled(pos.positionKey);
                const options = getStaffOptions(pos.positionKey);

                return (
                  <div key={pos.positionKey} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${locked ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
                    {/* Position info */}
                    <div className="w-40 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {locked && <Lock className="h-3 w-3 text-gray-400" />}
                        <span className="text-xs font-semibold text-gray-700">{pos.positionLabel}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{formatVND(pos.amount)}</div>
                      {(() => {
                        const cat = positions.find(p => p.key === pos.positionKey);
                        if (cat?.staffFilterKey) {
                          return (
                            <div className="text-[9px] text-teal-600 font-medium truncate">
                              Ánh xạ: {getSurgeryMappingLabel(cat.staffFilterKey)}
                            </div>
                          );
                        }
                        if (cat?.onlyNonSurgicalStaff) {
                          return (
                            <div className="text-[9px] text-amber-600 font-medium truncate">
                              Chỉ NV Ngoài PT
                            </div>
                          );
                        }
                        return (
                          <div className="text-[9px] text-gray-400 font-normal truncate">
                            Tất cả nhân viên
                          </div>
                        );
                      })()}
                    </div>

                    {/* Staff selector */}
                    <div className="flex-1 relative">
                      {locked ? (
                        <div className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-600 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-gray-400" />
                            <span>{staffMap[pos.positionKey] || '—'}</span>
                          </div>
                          {auto && <span className="text-[9px] text-emerald-600 font-semibold px-1 py-0.5 bg-emerald-50 rounded border border-emerald-200">(auto)</span>}
                        </div>
                      ) : (
                        <StaffCombobox
                          value={staffMap[pos.positionKey] || ''}
                          onChange={(val) => setStaffMap(prev => ({ ...prev, [pos.positionKey]: val }))}
                          options={options}
                          isAuto={auto}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50 rounded-b-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
              Hủy
            </button>
            {error && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-red-600 max-w-[280px] leading-tight">{error}</span>
                {error.includes('đăng nhập') && (
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="text-[11px] font-bold text-primary-700 hover:underline cursor-pointer"
                  >
                    Đăng nhập ngay
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!selectedPkgId || saving}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Đang lưu...' : existingAssignment ? 'Cập nhật' : 'Gán gói'}
          </button>
        </div>
      </div>
    </div>
  );
};
