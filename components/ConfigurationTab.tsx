import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Save, RefreshCw, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown, Download, Upload, UserPlus, Edit3, XCircle, ChevronRight, Search, ChevronLeft, Building2, Layers, Users, ClipboardList, Activity, Clock, Pencil, Check, Cpu, ToggleLeft, ToggleRight, DollarSign, BookOpen, Database } from 'lucide-react';
import { Receipt } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig, RolePrice } from '../contexts/ConfigContext';
import { MachineEntry, StaffMember, SurgeryNamePrice, LaborConfigVersion, SurgeryPriceVersion, ChapterCatalog, SurgeryProfile, SurgeryCostItem } from '../types';
import { LaborConfigManager } from './config/LaborConfigManager';
import { subscribeToLaborConfigs, ensureDefaultLaborConfig } from '../services/laborConfigService';
import { reportService } from '../services/reportService';
import { subscribeToSurgeryNamePrices } from '../services/surgeryNamePriceService';
import { getUniqueNamesFromPrices } from '../services/profileService';
import { ContextToolbar, TabLine } from './ui';
import { subscribeToPriceVersions } from '../services/pricingService';
import { subscribeToChapterCatalog } from '../services/chapterCatalogService';
import { subscribeToProfiles } from '../services/profileService';
import { subscribeToCostItems } from '../services/surgeryCostService';
import { SurgeryNamePriceConfig } from './statistics/SurgeryNamePriceConfig';
import { ChapterCatalogConfig } from './statistics/ChapterCatalogConfig';
import { SurgeryCostConfig } from './statistics/SurgeryCostConfig';

import { RequiredMachineCatalogConfig } from './config/RequiredMachineCatalogConfig';

// Helper component for formatted number input
const NumberInput: React.FC<{
    value: number;
    onChange: (val: number) => void;
    className?: string;
    align?: 'left' | 'center' | 'right';
}> = ({ value, onChange, className = "", align = 'right' }) => {
    const [localVal, setLocalVal] = useState(value.toString());

    useEffect(() => {
        setLocalVal(value.toString());
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/,/g, '');
        if (!isNaN(Number(raw))) {
            setLocalVal(raw); // Keep raw in local state for typing
            onChange(Number(raw));
        }
    };

    const handleBlur = () => {
        setLocalVal(value.toString()); // Reset to valid prop value on blur
    };

    // Format display value with commas
    const displayValue = localVal === '' ? '' : Number(localVal).toLocaleString('en-US');

    return (
        <input
            type="text"
            value={displayValue}
            onChange={(e) => {
                // Remove commas to get raw number
                const val = e.target.value.replace(/,/g, '');
                if (/^\d*$/.test(val)) {
                    onChange(Number(val));
                    setLocalVal(val);
                }
            }}
            onBlur={handleBlur}
            className={`${className} text-${align}`}
        />
    );
};

interface ConfigurationTabProps {
    onConfigUpdate?: () => void;
}

export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ onConfigUpdate }) => {
    const { config, updateConfig, resetConfig, isLoaded } = useConfig();
    const staffList = config.staffList || [];
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'dmkt' | 'staff'>('norms');
    const [dmktSubTab, setDmktSubTab] = useState<'chapter-catalog' | 'price-catalog' | 'cost-catalog' | 'machines' | 'registry'>('chapter-catalog');
    const [staffSubTab, setStaffSubTab] = useState<'admin' | 'departments' | 'staff-list'>('admin');
    const [newMachineName, setNewMachineName] = useState("");
    const [editingMachineIndex, setEditingMachineIndex] = useState<number | null>(null);
    const [editingPriceRow, setEditingPriceRow] = useState<string | null>(null);

    // --- Timeline-based labor config ---
    const [laborConfigs, setLaborConfigs] = useState<LaborConfigVersion[]>([]);
    useEffect(() => {
      // Auto-migrate static config to timeline version on first load
      ensureDefaultLaborConfig(config.priceConfig, config.timeRules).catch(console.error);
      const unsub = subscribeToLaborConfigs(setLaborConfigs);
      return () => unsub();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Surgery name autocomplete ---
    const [surgeryNamePrices, setSurgeryNamePrices] = useState<SurgeryNamePrice[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputWrapperRef = useRef<HTMLDivElement>(null);

    // Subscribe to surgery name prices (same source as Profile)
    useEffect(() => {
      const unsub = subscribeToSurgeryNamePrices((data) => {
        setSurgeryNamePrices(data);
      });
      return () => unsub();
    }, []);

    // --- Subscriptions for migrated tabs ---
    const [priceVersions, setPriceVersions] = useState<SurgeryPriceVersion[]>([]);
    const [chapters, setChapters] = useState<ChapterCatalog[]>([]);
    const [profiles, setProfiles] = useState<SurgeryProfile[]>([]);
    const [costItems, setCostItems] = useState<SurgeryCostItem[]>([]);

    useEffect(() => {
      const unsub = subscribeToPriceVersions(setPriceVersions);
      return unsub;
    }, []);
    useEffect(() => {
      const unsub = subscribeToChapterCatalog(setChapters);
      return unsub;
    }, []);
    useEffect(() => {
      const unsub = subscribeToProfiles(setProfiles);
      return unsub;
    }, []);
    useEffect(() => {
      const unsub = subscribeToCostItems(setCostItems);
      return unsub;
    }, []);

    // All unique surgery names from price catalog
    const allSurgeryNames = useMemo(
      () => getUniqueNamesFromPrices(surgeryNamePrices),
      [surgeryNamePrices]
    );

    // Remove Vietnamese diacritics for fuzzy matching
    const removeDiacritics = useCallback((str: string) => {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }, []);

    // Fuzzy-filtered suggestions
    const filteredSuggestions = useMemo(() => {
      const q = newMachineName.trim().toLowerCase();
      if (!q || q.length < 2) return [];
      const qNorm = removeDiacritics(q);
      const tokens = qNorm.split(/\s+/);
      return allSurgeryNames
        .filter(name => {
          const lower = name.toLowerCase();
          // Match with diacritics first, then without
          if (tokens.every(t => lower.includes(t))) return true;
          const norm = removeDiacritics(lower);
          return tokens.every(t => norm.includes(t));
        })
        .slice(0, 50);
    }, [allSurgeryNames, newMachineName, removeDiacritics]);

    // Close suggestions on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (inputWrapperRef.current && !inputWrapperRef.current.contains(e.target as Node)) {
          setShowSuggestions(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectSuggestion = useCallback((name: string) => {
      setNewMachineName(name);
      setShowSuggestions(false);
      setHighlightedIdx(-1);
    }, []);

    const handleSuggestionKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (!showSuggestions || filteredSuggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx(prev => Math.min(prev + 1, filteredSuggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && highlightedIdx >= 0) {
        e.preventDefault();
        handleSelectSuggestion(filteredSuggestions[highlightedIdx]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }, [showSuggestions, filteredSuggestions, highlightedIdx, handleSelectSuggestion]);
    const [newDeptName, setNewDeptName] = useState("");

    // Section 2: Medical Staff State
    const [staffForm, setStaffForm] = useState<Omit<StaffMember, 'id'>>({
        name: "",
        position: '',
        taxId: "",
        department: ""
    });
    const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

    // Time input auto-formatting handler for working hours
    const handleWorkingHoursTimeChange = (val: string, setter: (v: string) => void) => {
        // 1. Remove non-digits and limit length
        let clean = val.replace(/[^0-9]/g, '');
        if (clean.length > 4) clean = clean.substring(0, 4);

        // 2. Extract parts
        let hh = clean.substring(0, 2);
        let mm = clean.substring(2, 4);

        // 3. Validate Hours (00-23)
        if (hh.length === 2 && parseInt(hh, 10) > 23) {
            hh = '23';
        }

        // 4. Validate Minutes (00-59)
        if (mm.length === 2 && parseInt(mm, 10) > 59) {
            mm = '59';
        }

        // 5. Format Output
        let formatted = hh;
        if (clean.length >= 3) {
            formatted = `${hh}:${mm}`;
        }

        setter(formatted);
    };


    // Validate DD/MM format
    const validateDate = (dateStr: string): boolean => {
        if (dateStr.length !== 5) return false;
        const parts = dateStr.split('/');
        if (parts.length !== 2) return false;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (isNaN(day) || isNaN(month)) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        // Check days in month
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (day > daysInMonth[month - 1]) return false;
        return true;
    };


    // Helper function to compare times (returns true if time1 < time2)
    const isTimeBefore = (time1: string, time2: string): boolean => {
        if (!time1 || !time2 || time1.length < 5 || time2.length < 5) return true;
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);
        return (h1 * 60 + m1) < (h2 * 60 + m2);
    };


    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Section: Ignored Machines Search & Pagination
    const [machineSearchQuery, setMachineSearchQuery] = useState("");
    const [machineCurrentPage, setMachineCurrentPage] = useState(1);
    const [machinePageSize, setMachinePageSize] = useState(20);

    // Section: Machine Registry (Mã máy) State
    const [regSearchQuery, setRegSearchQuery] = useState("");
    const [regCurrentPage, setRegCurrentPage] = useState(1);
    const [regPageSize, setRegPageSize] = useState(20);
    const [regForm, setRegForm] = useState<Omit<MachineEntry, 'id'>>({
        machineId: "", machineCode: "", machineName: "", active: true
    });
    const [editingRegId, setEditingRegId] = useState<string | null>(null);

    // Import dialog state for machine registry
    type ImportDialogData = {
        allParsed: MachineEntry[];
        duplicatesInFile: { rowNum: number; entry: MachineEntry; firstRowNum: number }[];
        cleanEntries: MachineEntry[];
    };
    const [importDialog, setImportDialog] = useState<ImportDialogData | null>(null);

    // Backfill state
    const [backfillRunning, setBackfillRunning] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState<string>('');
    const [backfillResult, setBackfillResult] = useState<{ totalScanned: number; matched: number; alreadyFilled: number; noMachine: number; unmatched: number; updated: number; unmatchedNames: { name: string; count: number }[] } | null>(null);

    // These hooks MUST be before any early return to satisfy Rules of Hooks
    useEffect(() => { setMachineCurrentPage(1); }, [machineSearchQuery]);
    useEffect(() => { setRegCurrentPage(1); }, [regSearchQuery]);

    const filteredRegistryMemo = useMemo(() => {
        const reg = config.machineRegistry || [];
        if (!regSearchQuery.trim()) return reg;
        const q = regSearchQuery.toLowerCase().trim();
        return reg.filter(m =>
            m.machineId.toLowerCase().includes(q) ||
            m.machineCode.toLowerCase().includes(q) ||
            m.machineName.toLowerCase().includes(q)
        );
    }, [config.machineRegistry, regSearchQuery]);

    if (!isLoaded) return <div>Loading config...</div>;

    const handlePriceChange = (loai: string, role: keyof RolePrice, val: number) => {
        updateConfig({
            priceConfig: {
                ...config.priceConfig,
                [loai]: {
                    ...config.priceConfig[loai],
                    [role]: val
                }
            }
        });
    };

    const handleTimeChange = (loai: string, type: 'min' | 'max', val: number) => {
        updateConfig({
            timeRules: {
                ...config.timeRules,
                [loai]: {
                    ...config.timeRules[loai],
                    [type]: val
                }
            }
        });
    };

    const handleAddMachineName = () => {
        if (!newMachineName.trim()) return;
        const exists = config.ignoredMachineNames.includes(newMachineName.trim());
        if (exists) {
            alert("Tên phẫu thuật này đã có trong danh sách.");
            return;
        }
        const newNames = [...config.ignoredMachineNames, newMachineName.trim()];
        updateConfig({ ignoredMachineNames: newNames });
        setNewMachineName("");
        if (onConfigUpdate) onConfigUpdate();
    };

    const handleEditMachineName = (index: number) => {
        setEditingMachineIndex(index);
        setNewMachineName(config.ignoredMachineNames[index]);
    };

    const handleSaveMachineName = () => {
        if (editingMachineIndex === null || !newMachineName.trim()) return;
        const oldName = config.ignoredMachineNames[editingMachineIndex];
        const newName = newMachineName.trim();

        if (confirm(`Bạn có muốn sửa phẫu thuật, thủ thuật:\n"${oldName}"\nThành tên mới:\n"${newName}"?`)) {
            const newNames = [...config.ignoredMachineNames];
            newNames[editingMachineIndex] = newName;
            updateConfig({ ignoredMachineNames: newNames });
            setEditingMachineIndex(null);
            setNewMachineName("");
            if (onConfigUpdate) onConfigUpdate();
        }
    };

    const handleDeleteMachineName = (name: string) => {
        if (confirm(`Bạn có chắc chắn muốn xóa "${name}" khỏi danh sách?`)) {
            const newNames = config.ignoredMachineNames.filter(n => n !== name);
            updateConfig({ ignoredMachineNames: newNames });
            if (editingMachineIndex !== null && config.ignoredMachineNames[editingMachineIndex] === name) {
                setEditingMachineIndex(null);
                setNewMachineName("");
            }
            if (onConfigUpdate) onConfigUpdate();
        }
    };

    const handleExportMachines = () => {
        const machineNames = config.ignoredMachineNames || [];
        const header = ["Tên Phẫu thuật/Thủ thuật (Bỏ qua kiểm tra máy)"];
        const data = [header, ...machineNames.map(name => [name])];

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PTTT_BoQuaMay");
        XLSX.writeFile(wb, machineNames.length > 0 ? "DanhSach_PTTT_BoQuaMay.xlsx" : "Template_PTTT_BoQuaMay.xlsx");
    };

    const handleImportMachines = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            let newMachineNames: string[] = [...(config.ignoredMachineNames || [])];
            let addedCount = 0;

            workbook.SheetNames.forEach(sheetName => {
                const ws = workbook.Sheets[sheetName];
                const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                if (rows.length > 0) {
                    const headerRow = rows[0];
                    const nameColIdx = headerRow.findIndex((h: any) =>
                        String(h).toLowerCase().includes("tên phẫu thuật") ||
                        String(h).toLowerCase().includes("tên pttt")
                    );

                    if (nameColIdx !== -1) {
                        for (let i = 1; i < rows.length; i++) {
                            const name = String(rows[i][nameColIdx] || "").trim();
                            if (name && !newMachineNames.includes(name)) {
                                newMachineNames.push(name);
                                addedCount++;
                            }
                        }
                    }
                }
            });

            if (addedCount > 0) {
                updateConfig({ ignoredMachineNames: newMachineNames });
                alert(`Đã import thành công ${addedCount} tên PTTT mới.`);
                if (onConfigUpdate) onConfigUpdate();
            } else {
                alert("Không tìm thấy dữ liệu mới phù hợp trong file Excel.");
            }
            // Reset input
            e.target.value = "";
        };
        reader.readAsArrayBuffer(file);
    };

    const SURGERY_TYPES = ["PĐB", "P1", "P2", "P3"];
    const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"];

    const getPrice = (loai: string, role: keyof RolePrice) => config.priceConfig[loai]?.[role] ?? 0;
    const getTime = (loai: string, field: 'min' | 'max') => config.timeRules[loai]?.[field] ?? 0;

    // Logic: Ignored Machines Search & Pagination
    const filteredMachines = (config.ignoredMachineNames || []).filter(name => {
        if (!machineSearchQuery.trim()) return true;
        return name.toLowerCase().includes(machineSearchQuery.toLowerCase().trim());
    });

    const totalMachinePages = Math.ceil(filteredMachines.length / machinePageSize);
    const paginatedMachines = filteredMachines.slice(
        (machineCurrentPage - 1) * machinePageSize,
        machineCurrentPage * machinePageSize
    );

    // ────────── Machine Registry (Mã máy) Handlers ──────────
    const registry = config.machineRegistry || [];
    const filteredRegistry = filteredRegistryMemo;

    const totalRegPages = Math.ceil(filteredRegistry.length / regPageSize);
    const paginatedRegistry = filteredRegistry.slice(
        (regCurrentPage - 1) * regPageSize,
        regCurrentPage * regPageSize
    );

    const handleAddRegistry = () => {
        if (!regForm.machineCode.trim()) return;
        if (registry.some(m => m.machineCode === regForm.machineCode.trim())) {
            alert(`Mã máy "${regForm.machineCode.trim()}" đã tồn tại.`);
            return;
        }
        const newEntry: MachineEntry = {
            id: `reg_${Date.now()}`,
            machineId: regForm.machineId.trim(),
            machineCode: regForm.machineCode.trim(),
            machineName: regForm.machineName.trim(),
            active: regForm.active,
        };
        updateConfig({ machineRegistry: [...registry, newEntry] });
        setRegForm({ machineId: "", machineCode: "", machineName: "", active: true });
        if (onConfigUpdate) onConfigUpdate();
    };

    const handleEditRegistry = (entry: MachineEntry) => {
        setEditingRegId(entry.id);
        setRegForm({
            machineId: entry.machineId,
            machineCode: entry.machineCode,
            machineName: entry.machineName,
            active: entry.active,
        });
    };

    const handleSaveRegistry = () => {
        if (!editingRegId || !regForm.machineCode.trim()) return;
        // Check duplicate machineCode (excluding editing entry)
        if (registry.some(m => m.machineCode === regForm.machineCode.trim() && m.id !== editingRegId)) {
            alert(`Mã máy "${regForm.machineCode.trim()}" đã tồn tại.`);
            return;
        }
        const newList = registry.map(m => m.id === editingRegId ? {
            ...m,
            machineId: regForm.machineId.trim(),
            machineCode: regForm.machineCode.trim(),
            machineName: regForm.machineName.trim(),
            active: regForm.active,
        } : m);
        updateConfig({ machineRegistry: newList });
        setEditingRegId(null);
        setRegForm({ machineId: "", machineCode: "", machineName: "", active: true });
        if (onConfigUpdate) onConfigUpdate();
    };

    const handleDeleteRegistry = (id: string) => {
        if (!window.confirm("Bạn chắc chắn muốn xóa mã máy này?")) return;
        updateConfig({ machineRegistry: registry.filter(m => m.id !== id) });
        if (onConfigUpdate) onConfigUpdate();
    };

    const handleToggleActiveRegistry = (id: string) => {
        const newList = registry.map(m => m.id === id ? { ...m, active: !m.active } : m);
        updateConfig({ machineRegistry: newList });
        if (onConfigUpdate) onConfigUpdate();
    };

    const handleExportRegistry = () => {
        const header = ["ID máy", "Mã máy", "Tên máy", "Trạng thái"];
        const data = [header, ...registry.map(m => [m.machineId, m.machineCode, m.machineName, m.active ? "Sử dụng" : "Không sử dụng"])];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSach_MaMay");
        XLSX.writeFile(wb, registry.length > 0 ? "DanhSach_MaMay.xlsx" : "Template_MaMay.xlsx");
    };

    const handleImportRegistry = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const allParsed: MachineEntry[] = [];

            workbook.SheetNames.forEach(sheetName => {
                const ws = workbook.Sheets[sheetName];
                const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                if (rows.length < 2) return;

                const headerRow = rows[0].map((h: any) => String(h || "").toLowerCase().trim());
                const idCol = headerRow.findIndex(h => h.includes("id máy") || h === "machineid");
                const codeCol = headerRow.findIndex(h => h.includes("mã máy") || h === "machinecode");
                const nameCol = headerRow.findIndex(h => h.includes("tên máy") || h === "machinename");
                const statusCol = headerRow.findIndex(h => h.includes("trạng thái") || h === "status");

                if (codeCol === -1) return;

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i] || [];
                    const code = String(row[codeCol] || "").trim();
                    if (!code) continue;

                    allParsed.push({
                        id: `reg_${Date.now()}_${sheetName}_${i}`,
                        machineId: idCol !== -1 ? String(row[idCol] || "").trim() : "",
                        machineCode: code,
                        machineName: nameCol !== -1 ? String(row[nameCol] || "").trim() : code,
                        active: statusCol !== -1 ? !String(row[statusCol] || "").toLowerCase().includes("không") : true,
                        _rowNum: i + 1, // 1-based Excel row (header = row 1)
                    } as MachineEntry & { _rowNum: number });
                }
            });

            if (allParsed.length === 0) {
                alert("Không tìm thấy dữ liệu hợp lệ trong file. Vui lòng kiểm tra cấu trúc cột.");
                e.target.value = "";
                return;
            }

            // Detect duplicates within the uploaded file
            const seenMap = new Map<string, { entry: MachineEntry; rowNum: number }>();
            const duplicatesInFile: { rowNum: number; entry: MachineEntry; firstRowNum: number }[] = [];
            const cleanEntries: MachineEntry[] = [];

            allParsed.forEach((entry) => {
                const rowNum = (entry as any)._rowNum as number;
                const existing = seenMap.get(entry.machineCode);
                if (existing) {
                    // Duplicate found
                    duplicatesInFile.push({ rowNum, entry, firstRowNum: existing.rowNum });
                } else {
                    seenMap.set(entry.machineCode, { entry, rowNum });
                    cleanEntries.push(entry);
                }
            });

            // Show dialog with results
            setImportDialog({ allParsed, duplicatesInFile, cleanEntries });
            e.target.value = "";
        };
        reader.readAsArrayBuffer(file);
    };

    const handleConfirmImport = (mode: 'overwrite_clean' | 'cancel') => {
        if (mode === 'cancel' || !importDialog) {
            setImportDialog(null);
            return;
        }
        // overwrite_clean: import unique entries, replacing ALL existing data
        const newRegistry = importDialog.cleanEntries.map(e => {
            const { _rowNum, ...clean } = e as any;
            return clean as MachineEntry;
        });
        updateConfig({ machineRegistry: newRegistry });
        if (onConfigUpdate) onConfigUpdate();
        alert(`Đã import ${newRegistry.length} mã máy (ghi đè toàn bộ dữ liệu cũ).${importDialog.duplicatesInFile.length > 0 ? ` Đã loại ${importDialog.duplicatesInFile.length} dòng trùng.` : ''}`);
        setImportDialog(null);
    };

    const handleBackfill = async () => {
        if (registry.length === 0) {
            alert('Chưa có dữ liệu mã máy trong bảng đăng ký. Hãy import trước.');
            return;
        }
        if (!window.confirm(
            `Bạn có chắc chắn muốn backfill mã máy và ID máy cho toàn bộ dữ liệu lưu trữ?\n\n` +
            `Hệ thống sẽ quét tất cả bản ghi trên Firestore, so khớp trường "Tên máy" với ${registry.length} mã máy trong bảng đăng ký, rồi cập nhật trường machineCode và machineId.\n\n` +
            `Thao tác này không xóa dữ liệu, chỉ bổ sung thông tin còn thiếu.`
        )) return;

        setBackfillRunning(true);
        setBackfillProgress('Đang khởi tạo...');
        setBackfillResult(null);

        try {
            const result = await reportService.backfillMachineRegistry(registry, (msg) => {
                setBackfillProgress(msg);
            });
            setBackfillResult(result);
            setBackfillProgress('Hoàn thành!');
        } catch (err: any) {
            setBackfillProgress(`Lỗi: ${err.message}`);
        } finally {
            setBackfillRunning(false);
        }
    };

    // Helper to save staff without necessarily resetting the form
    const internalSaveStaff = (currentStaffForm: Omit<StaffMember, 'id'>, currentEditingId: string | null) => {
        if (!currentStaffForm.name.trim()) return null;
        const staffList = config.staffList || [];
        const newId = `${currentStaffForm.name.trim()}_${currentStaffForm.position}`;

        let newList: StaffMember[];
        if (currentEditingId) {
            newList = staffList.map(s => s.id === currentEditingId ? { ...currentStaffForm, id: newId } : s);
        } else {
            if (staffList.some(s => s.id === newId)) {
                alert("Nhân viên này đã tồn tại với vai trò này.");
                return null;
            }
            newList = [...staffList, { ...currentStaffForm, id: newId }];
        }
        updateConfig({ staffList: newList });
        return { newList, newId };
    };

    const handleSaveStaff = () => {
        if (internalSaveStaff(staffForm, editingStaffId)) {
            resetStaffForm();
        }
    };

    const resetStaffForm = () => {
        setStaffForm({ name: "", position: '', taxId: "", department: "" });
        setEditingStaffId(null);
    };

    const handleEditStaff = (staff: StaffMember) => {
        setStaffForm({
            name: staff.name,
            position: staff.position,
            taxId: staff.taxId,
            department: staff.department
        });
        setEditingStaffId(staff.id);
    };

    const getFilteredStaff = () => {
        const staffList = config.staffList || [];
        if (!searchQuery.trim()) return staffList;

        const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);

        return staffList.filter(s => {
            const combinedText = `${s.name} ${s.position} ${s.taxId} ${s.department}`.toLowerCase();
            let lastIdx = -1;
            for (const word of words) {
                const idx = combinedText.indexOf(word, lastIdx + 1);
                if (idx === -1) return false;
                lastIdx = idx;
            }
            return true;
        });
    };

    const filteredStaffList = getFilteredStaff();
    const totalPages = Math.ceil(filteredStaffList.length / pageSize);
    const paginatedStaff = filteredStaffList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Reset to page 1 when search query changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const handleNextStaff = () => {
        const staffList = config.staffList || [];
        if (staffList.length === 0) return;

        let currentList = staffList;
        let currentId = editingStaffId;

        // 1. Save current if editing
        if (editingStaffId) {
            const saveResult = internalSaveStaff(staffForm, editingStaffId);
            if (saveResult) {
                currentList = saveResult.newList;
                currentId = saveResult.newId;
            }
        }

        // 2. Filter list for "Next" navigation
        const currentFiltered = searchQuery.trim() ? currentList.filter(s => {
            const combinedText = `${s.name} ${s.position} ${s.taxId} ${s.department}`.toLowerCase();
            const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);
            let lastIdx = -1;
            for (const word of words) {
                const idx = combinedText.indexOf(word, lastIdx + 1);
                if (idx === -1) return false;
                lastIdx = idx;
            }
            return true;
        }) : currentList;

        // 3. Find next index
        let nextIdx = 0;
        if (currentId) {
            const currentIdx = currentFiltered.findIndex(s => s.id === currentId);
            if (currentIdx !== -1 && currentIdx < currentFiltered.length - 1) {
                nextIdx = currentIdx + 1;
            } else {
                nextIdx = 0;
            }
        }

        if (currentFiltered.length > 0) {
            handleEditStaff(currentFiltered[nextIdx]);
            // Ensure next record is on the visible page? (Optional refinement)
        }
    };

    const handleDeleteStaff = (id: string) => {
        if (confirm("Bạn có chắc chắn muốn xóa nhân viên này?")) {
            const newList = (config.staffList || []).filter(s => s.id !== id);
            updateConfig({ staffList: newList });
        }
    };

    const handleExportExcel = () => {
        const staffList = config.staffList || [];
        const headers = ["Họ tên", "Vị trí", "Khoa", "Mã số thuế TNCN"];

        let data: any[][] = [headers];

        if (staffList.length > 0) {
            staffList.forEach(s => {
                data.push([s.name, s.position, s.department, s.taxId]);
            });
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSachNVYT");
        XLSX.writeFile(wb, staffList.length > 0 ? "DanhSach_NhanVienYTe.xlsx" : "Template_NhanVienYTe.xlsx");
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            let allStaff: StaffMember[] = [];
            let validSheetsFound = 0;

            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length < 1) return;

                // Check for template headers (Họ tên, Vị trí, Khoa)
                const headers = jsonData[0].map(h => String(h || "").trim());
                const nameIdx = headers.indexOf("Họ tên");
                const posIdx = headers.indexOf("Vị trí");
                const deptIdx = headers.indexOf("Khoa");
                const taxIdx = headers.indexOf("Mã số thuế TNCN");

                // Logic: Must have at least "Họ tên", "Vị trí", "Khoa" to be considered a template sheet
                if (nameIdx !== -1 && posIdx !== -1 && deptIdx !== -1) {
                    validSheetsFound++;
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row) continue;

                        const name = row[nameIdx] ? String(row[nameIdx]).trim() : "";
                        if (!name) continue; // Skip rows with empty Họ tên

                        const posRaw = row[posIdx] ? String(row[posIdx]).trim() : "";
                        const dept = row[deptIdx] ? String(row[deptIdx]).trim() : "";
                        const tax = taxIdx !== -1 && row[taxIdx] ? String(row[taxIdx]).trim() : "";

                        // Map position strictly
                        let position: 'BS PT' | 'BS GMHS' | 'Phụ' | '' = '';
                        const p = posRaw.toUpperCase();
                        if (p.includes('BS PT')) position = 'BS PT';
                        else if (p.includes('BS GMHS')) position = 'BS GMHS';
                        else if (p.includes('PHỤ')) position = 'Phụ';

                        const id = `${name}_${position || 'unknown'}`;
                        allStaff.push({ id, name, position, taxId: tax, department: dept });
                    }
                }
            });

            if (validSheetsFound === 0) {
                alert("Không tìm thấy danh sách NVYT theo mẫu (Yêu cầu có các cột: Họ tên, Vị trí, Khoa)");
                return;
            }

            if (allStaff.length > 0) {
                if (confirm(`Tìm thấy tổng cộng ${allStaff.length} nhân viên từ ${validSheetsFound} sheet. Bạn có muốn ghi đè danh sách hiện tại?`)) {
                    updateConfig({ staffList: allStaff });
                }
            } else {
                alert("Không tìm thấy dữ liệu nhân viên hợp lệ trong các sheet phù hợp.");
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ""; // Clear for next upload
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 font-inter text-sm">

            {/* Firebase-style Page Header: title + sub-tabs */}
            <ContextToolbar title="Cấu hình">
              <TabLine
                value={activeSubTab}
                onChange={(v) => setActiveSubTab(v as any)}
                options={[
                  { value: 'norms', label: 'Định mức & Phụ cấp', icon: ClipboardList },
                  { value: 'dmkt', label: 'DMKT', icon: Database },
                  { value: 'staff', label: 'Hành chính', icon: Users },
                ]}
              />
            </ContextToolbar>

            {/* Content area */}
            <div className="p-4 flex-1 overflow-y-auto bg-white">

                {activeSubTab === 'norms' && (
                    <div className="animate-fade-in space-y-6">
                        {/* Timeline-based labor config */}
                        <LaborConfigManager laborConfigs={laborConfigs} />
                    </div>
                )}

                {activeSubTab === 'dmkt' && (
                    <div className="animate-fade-in space-y-0">
                        {/* Nested DMKT sub-tabs */}
                        <div className="-mx-4 mt-0 mb-4 border-b border-blue-200 bg-blue-50/50 px-4">
                            <TabLine
                                value={dmktSubTab}
                                onChange={(v) => setDmktSubTab(v as any)}
                                size="sm"
                                options={[
                                    { value: 'chapter-catalog', label: 'DM Chương', icon: BookOpen },
                                    { value: 'price-catalog', label: 'DM Giá DVKT', icon: DollarSign },
                                    { value: 'cost-catalog', label: 'DM Chi phí', icon: Receipt },
                                    { value: 'machines', label: 'DM Sử dụng mã máy', icon: Cpu },
                                    { value: 'registry', label: 'DM Mã máy', icon: Activity },
                                ]}
                            />
                        </div>

                        {dmktSubTab === 'chapter-catalog' && (
                            <div className="p-1">
                                <ChapterCatalogConfig chapters={chapters} />
                            </div>
                        )}

                        {dmktSubTab === 'price-catalog' && (
                            <div className="p-1">
                                <SurgeryNamePriceConfig surgeryNamePrices={surgeryNamePrices} costItems={costItems} profiles={profiles} />
                            </div>
                        )}

                        {dmktSubTab === 'cost-catalog' && (
                            <div className="p-1">
                                <SurgeryCostConfig costItems={costItems} />
                            </div>
                        )}

                        {dmktSubTab === 'machines' && (
                            <RequiredMachineCatalogConfig />
                        )}

                        {dmktSubTab === 'registry' && (
                            <div className="space-y-3">
                                {/* Import Confirmation Dialog */}
                                {importDialog && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
                                            <div className="px-6 py-4 bg-gradient-to-r from-teal-600 to-teal-700 text-white flex items-center gap-3">
                                                <AlertCircle className="h-6 w-6 shrink-0" />
                                                <div>
                                                    <h3 className="font-bold text-lg">Xác nhận Import mã máy</h3>
                                                    <p className="text-teal-100 text-sm">Đọc được {importDialog.allParsed.length} dòng từ file Excel</p>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex gap-2 text-amber-800">
                                                    <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                                                    <div className="text-sm">
                                                        <p className="font-bold">⚠️ Import sẽ GHI ĐÈ toàn bộ dữ liệu mã máy hiện có!</p>
                                                        <p className="text-amber-700 mt-1">Hiện tại đang có <strong>{registry.length}</strong> mã máy. Sau khi import, dữ liệu cũ sẽ bị thay thế bởi <strong>{importDialog.cleanEntries.length}</strong> mã máy từ file.</p>
                                                    </div>
                                                </div>
                                                {importDialog.duplicatesInFile.length > 0 ? (
                                                    <div className="space-y-3">
                                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-red-800">
                                                            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                                                            <div className="text-sm">
                                                                <p className="font-bold">Phát hiện {importDialog.duplicatesInFile.length} dòng trùng mã máy!</p>
                                                                <p className="text-red-600">Chỉ dòng đầu tiên sẽ được giữ lại.</p>
                                                            </div>
                                                        </div>
                                                        <div className="overflow-auto max-h-[250px] border border-gray-200 rounded-lg">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-red-100 text-red-800 font-bold uppercase sticky top-0"><tr><th className="px-3 py-2 text-center w-[70px] border-r">Dòng</th><th className="px-3 py-2 w-[100px] border-r">ID máy</th><th className="px-3 py-2 w-[120px] border-r">Mã máy</th><th className="px-3 py-2 border-r">Tên máy</th><th className="px-3 py-2 w-[90px] border-r">Trạng thái</th><th className="px-3 py-2 w-[90px]">Trùng dòng</th></tr></thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {importDialog.duplicatesInFile.map((dup, idx) => (
                                                                        <tr key={idx} className="bg-red-50/50 hover:bg-red-50">
                                                                            <td className="px-3 py-2 text-center font-bold text-red-600 border-r">{dup.rowNum}</td>
                                                                            <td className="px-3 py-2 font-mono text-gray-600 border-r">{dup.entry.machineId || '—'}</td>
                                                                            <td className="px-3 py-2 font-bold text-red-700 border-r">{dup.entry.machineCode}</td>
                                                                            <td className="px-3 py-2 text-gray-700 border-r">{dup.entry.machineName || '—'}</td>
                                                                            <td className="px-3 py-2 text-center border-r"><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${dup.entry.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{dup.entry.active ? 'Sử dụng' : 'Tắt'}</span></td>
                                                                            <td className="px-3 py-2 text-center font-bold text-gray-500">↑ dòng {dup.firstRowNum}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2 text-green-800">
                                                        <Check className="h-5 w-5 shrink-0 text-green-600" />
                                                        <div className="text-sm"><p className="font-bold">✓ Không có mã máy nào trùng lặp</p><p className="text-green-600">Tất cả {importDialog.cleanEntries.length} mã máy đều duy nhất.</p></div>
                                                    </div>
                                                )}
                                                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700"><p><strong>Tóm tắt:</strong> {importDialog.cleanEntries.length} mã máy sẽ được import{importDialog.duplicatesInFile.length > 0 && <span className="text-red-600"> ({importDialog.duplicatesInFile.length} dòng trùng sẽ bị loại)</span>}</p></div>
                                            </div>
                                            <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
                                                <button onClick={() => handleConfirmImport('cancel')} className="px-5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-all">Hủy</button>
                                                <button onClick={() => handleConfirmImport('overwrite_clean')} className="px-5 py-2 text-sm font-bold text-white bg-teal-600 border border-teal-700 rounded-lg hover:bg-teal-700 transition-all shadow-sm">Import {importDialog.cleanEntries.length} mã máy (ghi đè)</button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Header + Actions: Title left, Export + Backfill + Import right */}
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-gray-800 text-sm">Danh sách máy ({registry.length} máy, {registry.filter(m => m.active).length} đang sử dụng)</h4>
                                    <div className="flex gap-2">
                                        <button onClick={handleExportRegistry} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                                            <Download className="h-3.5 w-3.5" /> Xuất Excel
                                        </button>
                                        <button
                                            onClick={handleBackfill}
                                            disabled={backfillRunning || registry.length === 0}
                                            title="Backfill: Bổ sung mã máy & ID máy cho các bản ghi cũ dựa vào tên máy đã nhập trong dữ liệu phẫu thuật"
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${backfillRunning || registry.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${backfillRunning ? 'animate-spin' : ''}`} />
                                            {backfillRunning ? 'Đang backfill...' : 'Backfill'}
                                        </button>
                                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-all shadow-sm">
                                            <Upload className="h-3.5 w-3.5" /> Import Excel
                                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportRegistry} />
                                        </label>
                                    </div>
                                </div>

                                {/* Backfill progress/result (inline, no frame) */}
                                {backfillProgress && (
                                    <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700 font-medium">{backfillProgress}</div>
                                )}
                                {backfillResult && (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-6 gap-2 text-center">
                                            <div className="bg-gray-50 rounded-lg p-1.5"><p className="text-sm font-bold text-gray-800">{backfillResult.totalScanned}</p><p className="text-[10px] text-gray-500 font-bold">Tổng quét</p></div>
                                            <div className="bg-green-50 rounded-lg p-1.5"><p className="text-sm font-bold text-green-600">{backfillResult.matched}</p><p className="text-[10px] text-green-600 font-bold">Khớp</p></div>
                                            <div className="bg-blue-50 rounded-lg p-1.5"><p className="text-sm font-bold text-blue-600">{backfillResult.alreadyFilled}</p><p className="text-[10px] text-blue-600 font-bold">Đã có sẵn</p></div>
                                            <div className="bg-slate-50 rounded-lg p-1.5"><p className="text-sm font-bold text-slate-500">{backfillResult.noMachine}</p><p className="text-[10px] text-slate-500 font-bold">Không tên máy</p></div>
                                            <div className="bg-amber-50 rounded-lg p-1.5"><p className="text-sm font-bold text-amber-600">{backfillResult.unmatched}</p><p className="text-[10px] text-amber-600 font-bold">Không khớp</p></div>
                                            <div className="bg-teal-50 rounded-lg p-1.5"><p className="text-sm font-bold text-teal-600">{backfillResult.updated}</p><p className="text-[10px] text-teal-600 font-bold">Đã cập nhật</p></div>
                                        </div>
                                        {backfillResult.unmatchedNames.length > 0 && (
                                            <details className="text-xs">
                                                <summary className="font-bold text-amber-700 cursor-pointer">{backfillResult.unmatchedNames.length} tên máy không khớp</summary>
                                                <div className="mt-1 overflow-auto max-h-[150px] border border-amber-200 rounded-lg">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-amber-50 text-amber-800 font-semibold uppercase sticky top-0"><tr><th className="px-2 py-1 text-center w-10 border-r">STT</th><th className="px-2 py-1 text-left border-r">Tên máy</th><th className="px-2 py-1 text-center w-16">Số BG</th></tr></thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {backfillResult.unmatchedNames.map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-amber-50/50"><td className="px-2 py-1 text-center text-gray-400 border-r">{idx + 1}</td><td className="px-2 py-1 text-gray-700 border-r">{item.name}</td><td className="px-2 py-1 text-center font-bold text-amber-600">{item.count}</td></tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}

                                {/* Compact Add/Edit Form */}
                                <div className="flex items-end gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">ID máy</label>
                                        <input type="text" value={regForm.machineId} onChange={(e) => setRegForm({ ...regForm, machineId: e.target.value })} placeholder="M001" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Mã máy <span className="text-red-500">*</span></label>
                                        <input type="text" value={regForm.machineCode} onChange={(e) => setRegForm({ ...regForm, machineCode: e.target.value })} placeholder="NS-001" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div className="flex-[2] min-w-0">
                                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Tên máy</label>
                                        <input type="text" value={regForm.machineName} onChange={(e) => setRegForm({ ...regForm, machineName: e.target.value })} placeholder="Nội soi Karl Storz" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                                    </div>
                                    {editingRegId ? (
                                        <>
                                            <button onClick={handleSaveRegistry} className="px-3 py-1 bg-orange-500 text-white font-semibold rounded text-xs hover:bg-orange-600 transition-all flex items-center gap-1 whitespace-nowrap"><Save className="h-3.5 w-3.5" /> Lưu</button>
                                            <button onClick={() => { setEditingRegId(null); setRegForm({ machineId: "", machineCode: "", machineName: "", active: true }); }} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors" title="Hủy"><XCircle className="h-4 w-4" /></button>
                                        </>
                                    ) : (
                                        <button onClick={handleAddRegistry} disabled={!regForm.machineCode.trim()} className="px-3 py-1 bg-blue-600 text-white font-semibold rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1 whitespace-nowrap"><Plus className="h-3.5 w-3.5" /> Thêm</button>
                                    )}
                                </div>

                                {/* Search bar above table */}
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input type="text" value={regSearchQuery} onChange={(e) => setRegSearchQuery(e.target.value)} placeholder="Tìm ID, mã hoặc tên máy..." className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>

                                {/* Data Table */}
                                <div className="overflow-hidden border border-gray-200 rounded-xl bg-white">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold w-12">STT</th>
                                                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold w-24">ID máy</th>
                                                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold w-36">Mã máy</th>
                                                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Tên máy</th>
                                                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold w-20">Sử dụng</th>
                                                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold w-12">Xóa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {paginatedRegistry.length === 0 ? (
                                                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic text-sm">{regSearchQuery.trim() ? 'Không tìm thấy kết quả.' : 'Chưa có mã máy nào.'}</td></tr>
                                            ) : (
                                                paginatedRegistry.map((entry, idx) => {
                                                    const globalIdx = (regCurrentPage - 1) * regPageSize + idx;
                                                    return (
                                                        <tr key={entry.id} onClick={() => handleEditRegistry(entry)} className={`cursor-pointer transition-colors ${editingRegId === entry.id ? 'bg-blue-50' : 'hover:bg-gray-50'} ${!entry.active ? 'opacity-50' : ''}`}>
                                                            <td className="px-3 py-2 text-center text-gray-400">{globalIdx + 1}</td>
                                                            <td className="px-3 py-2 font-mono text-gray-600 text-xs">{entry.machineId || '—'}</td>
                                                            <td className="px-3 py-2 font-semibold text-blue-700">{entry.machineCode}</td>
                                                            <td className="px-3 py-2 text-gray-800">{entry.machineName || '—'}</td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button onClick={(e) => { e.stopPropagation(); handleToggleActiveRegistry(entry.id); }} title={entry.active ? 'Đang sử dụng — bấm để tắt' : 'Đã tắt — bấm để bật'}>
                                                                    {entry.active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRegistry(entry.id); }} className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination below table */}
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-gray-400">Số dòng:</span>
                                            <select value={regPageSize} onChange={(e) => { setRegPageSize(Number(e.target.value)); setRegCurrentPage(1); }} className="px-2 py-0.5 border border-gray-200 rounded text-xs font-semibold bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                                                {[10, 20, 30, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <span>Đang xem {(regCurrentPage - 1) * regPageSize + 1}–{Math.min(regCurrentPage * regPageSize, filteredRegistry.length)} trong tổng số {filteredRegistry.length}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setRegCurrentPage(p => Math.max(1, p - 1))} disabled={regCurrentPage === 1} className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
                                        <span className="text-xs font-semibold px-1.5 min-w-[70px] text-center">{regCurrentPage} / {Math.max(1, totalRegPages)}</span>
                                        <button onClick={() => setRegCurrentPage(p => Math.min(totalRegPages, p + 1))} disabled={regCurrentPage >= totalRegPages} className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeSubTab === 'staff' && (
                    <div className="animate-fade-in space-y-4">
                        {/* Nested Hành chính sub-tabs */}
                        <div className="-mx-4 -mt-2 mb-4 border-b border-blue-200 bg-blue-50/50 px-4">
                            <TabLine
                                value={staffSubTab}
                                onChange={(v) => setStaffSubTab(v as any)}
                                size="sm"
                                options={[
                                    { value: 'admin', label: 'Hành chính', icon: Building2 },
                                    { value: 'departments', label: 'DM Khoa, phòng', icon: Layers },
                                    { value: 'staff-list', label: 'Nhân viên y tế', icon: Users },
                                ]}
                            />
                        </div>

                        {/* Subtab 1: Hành chính (Tên bệnh viện, Giờ làm việc) */}
                        {staffSubTab === 'admin' && (
                            <div className="space-y-4 p-1">
                                {/* Section 1: Hospital Name */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                            <Building2 className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-800 text-sm">Tên Bệnh viện</h4>
                                            <p className="text-[11px] text-gray-400">Hiển thị trên các báo cáo và biểu mẫu thống kê</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <input
                                            type="text"
                                            value={config.hospitalName || ""}
                                            onChange={(e) => updateConfig({ hospitalName: e.target.value })}
                                            placeholder="Nhập tên bệnh viện hiển thị trên báo cáo..."
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium text-gray-800 bg-white"
                                        />
                                        <div className="flex items-center gap-1.5 text-gray-400 select-none">
                                            <Save className="h-3.5 w-3.5 text-green-500" />
                                            <span className="text-[10px] font-bold italic text-gray-500">Tự động lưu</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Working Hours */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                            <Clock className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-800 text-sm">Cấu hình giờ làm việc</h4>
                                            <p className="text-[11px] text-gray-400">Thiết lập khung giờ theo mùa (Mùa hè / Mùa đông) để phân loại ca phẫu thuật trong và ngoài giờ</p>
                                        </div>
                                    </div>

                                    <div className="overflow-hidden border border-gray-200 rounded-xl bg-white">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-4 py-2.5 border-r border-gray-200 w-[160px] text-left text-gray-500 font-semibold">Khung thời gian</th>
                                                    <th className="px-4 py-2.5 border-r border-gray-200 text-center text-gray-600 font-semibold">Mùa hè</th>
                                                    <th className="px-4 py-2.5 text-center text-gray-600 font-semibold">Mùa đông</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {/* Ngày áp dụng */}
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-2.5 border-r border-gray-100 font-medium text-gray-700">Ngày áp dụng</td>
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.dateFrom || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/-/g, '/');
                                                                    updateConfig({
                                                                        workingHours: {
                                                                            ...config.workingHours,
                                                                            summer: { ...config.workingHours?.summer, dateFrom: val } as any
                                                                        }
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.summer.dateFrom || "";
                                                                    if (!validateDate(val)) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, dateFrom: "01/05" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                placeholder="DD/MM"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">Đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.dateTo || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/-/g, '/');
                                                                    updateConfig({
                                                                        workingHours: {
                                                                            ...config.workingHours,
                                                                            summer: { ...config.workingHours?.summer, dateTo: val } as any
                                                                        }
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.summer.dateTo || "";
                                                                    if (!validateDate(val)) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, dateTo: "30/09" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                placeholder="DD/MM"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.dateFrom || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/-/g, '/');
                                                                    updateConfig({
                                                                        workingHours: {
                                                                            ...config.workingHours,
                                                                            winter: { ...config.workingHours?.winter, dateFrom: val } as any
                                                                        }
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.winter.dateFrom || "";
                                                                    if (!validateDate(val)) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, dateFrom: "01/10" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                placeholder="DD/MM"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">Đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.dateTo || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.replace(/-/g, '/');
                                                                    updateConfig({
                                                                        workingHours: {
                                                                            ...config.workingHours,
                                                                            winter: { ...config.workingHours?.winter, dateTo: val } as any
                                                                        }
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.winter.dateTo || "";
                                                                    if (!validateDate(val)) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, dateTo: "30/04" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                placeholder="DD/MM"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Buổi sáng */}
                                                <tr className="bg-gray-50/40 hover:bg-gray-50">
                                                    <td className="px-4 py-2.5 border-r border-gray-100 font-medium text-gray-700">Buổi sáng</td>
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.morningFrom || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, morningFrom: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.summer.morningFrom || "";
                                                                    if (val.length !== 5 || val === "00:00") {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, morningFrom: "07:00" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.morningTo || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        const fromTime = config.workingHours?.summer.morningFrom || "";
                                                                        if (formatted.length === 5 && !isTimeBefore(fromTime, formatted)) {
                                                                            return;
                                                                        }
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, morningTo: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const fromTime = config.workingHours?.summer.morningFrom || "";
                                                                    const toTime = config.workingHours?.summer.morningTo || "";
                                                                    if (toTime.length !== 5 || toTime === "00:00" || (toTime.length === 5 && !isTimeBefore(fromTime, toTime))) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, morningTo: "11:30" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.morningFrom || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, morningFrom: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.winter.morningFrom || "";
                                                                    if (val.length !== 5 || val === "00:00") {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, morningFrom: "07:30" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.morningTo || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        const fromTime = config.workingHours?.winter.morningFrom || "";
                                                                        if (formatted.length === 5 && !isTimeBefore(fromTime, formatted)) {
                                                                            return;
                                                                        }
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, morningTo: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const fromTime = config.workingHours?.winter.morningFrom || "";
                                                                    const toTime = config.workingHours?.winter.morningTo || "";
                                                                    if (toTime.length !== 5 || toTime === "00:00" || (toTime.length === 5 && !isTimeBefore(fromTime, toTime))) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, morningTo: "12:00" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Buổi chiều */}
                                                <tr className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-2.5 border-r border-gray-100 font-medium text-gray-700">Buổi chiều</td>
                                                    <td className="px-4 py-2.5 border-r border-gray-100">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.afternoonFrom || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, afternoonFrom: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.summer.afternoonFrom || "";
                                                                    if (val.length !== 5 || val === "00:00") {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, afternoonFrom: "13:30" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.summer.afternoonTo || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        const fromTime = config.workingHours?.summer.afternoonFrom || "";
                                                                        if (formatted.length === 5 && !isTimeBefore(fromTime, formatted)) {
                                                                            return;
                                                                        }
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, afternoonTo: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const fromTime = config.workingHours?.summer.afternoonFrom || "";
                                                                    const toTime = config.workingHours?.summer.afternoonTo || "";
                                                                    if (toTime.length !== 5 || toTime === "00:00" || (toTime.length === 5 && !isTimeBefore(fromTime, toTime))) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                summer: { ...config.workingHours?.summer, afternoonTo: "17:00" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-gray-500">Từ</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.afternoonFrom || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, afternoonFrom: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const val = config.workingHours?.winter.afternoonFrom || "";
                                                                    if (val.length !== 5 || val === "00:00") {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, afternoonFrom: "13:00" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                            <span className="text-gray-500">đến</span>
                                                            <input
                                                                type="text"
                                                                value={config.workingHours?.winter.afternoonTo || ""}
                                                                onChange={(e) => {
                                                                    handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                        const fromTime = config.workingHours?.winter.afternoonFrom || "";
                                                                        if (formatted.length === 5 && !isTimeBefore(fromTime, formatted)) {
                                                                            return;
                                                                        }
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, afternoonTo: formatted } as any
                                                                            }
                                                                        });
                                                                    });
                                                                }}
                                                                onBlur={() => {
                                                                    const fromTime = config.workingHours?.winter.afternoonFrom || "";
                                                                    const toTime = config.workingHours?.winter.afternoonTo || "";
                                                                    if (toTime.length !== 5 || toTime === "00:00" || (toTime.length === 5 && !isTimeBefore(fromTime, toTime))) {
                                                                        updateConfig({
                                                                            workingHours: {
                                                                                ...config.workingHours,
                                                                                winter: { ...config.workingHours?.winter, afternoonTo: "17:00" } as any
                                                                            }
                                                                        });
                                                                    }
                                                                }}
                                                                maxLength={5}
                                                                placeholder="HH:mm"
                                                                className="w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Subtab 2: DM Khoa, phòng */}
                        {staffSubTab === 'departments' && (
                            <div className="space-y-4 p-1">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                            <Layers className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-800 text-sm">Danh mục Khoa, phòng</h4>
                                            <p className="text-[11px] text-gray-400">Quản lý danh sách các khoa/phòng trong bệnh viện ({(config.departments || []).length} đơn vị)</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Compact inline Add Form */}
                                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
                                    <input
                                        type="text"
                                        value={newDeptName}
                                        onChange={(e) => setNewDeptName(e.target.value)}
                                        placeholder="Nhập tên khoa, phòng cần bổ sung..."
                                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newDeptName.trim()) {
                                                const depts = config.departments || [];
                                                if (!depts.includes(newDeptName.trim())) {
                                                    updateConfig({ departments: [...depts, newDeptName.trim()] });
                                                    setNewDeptName("");
                                                }
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            if (newDeptName.trim()) {
                                                const depts = config.departments || [];
                                                if (!depts.includes(newDeptName.trim())) {
                                                    updateConfig({ departments: [...depts, newDeptName.trim()] });
                                                    setNewDeptName("");
                                                }
                                            }
                                        }}
                                        disabled={!newDeptName.trim()}
                                        title="Thêm khoa phòng"
                                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Thêm
                                    </button>
                                </div>

                                {/* Departments Table */}
                                <div className="overflow-hidden border border-gray-200 rounded-xl bg-white shadow-sm">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2.5 w-14 text-center text-gray-500 font-semibold border-r border-gray-100">STT</th>
                                                <th className="px-4 py-2.5 text-gray-600 font-semibold">Tên khoa, phòng</th>
                                                <th className="px-4 py-2.5 w-24 text-center text-gray-500 font-semibold">Thứ tự</th>
                                                <th className="px-4 py-2.5 w-16 text-center text-gray-500 font-semibold">Xóa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {(config.departments || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400 italic text-sm">
                                                        Chưa có khoa phòng nào trong danh sách.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (config.departments || []).map((dept, idx) => (
                                                    <tr key={dept} className="hover:bg-gray-50/70 transition-colors">
                                                        <td className="px-4 py-2.5 text-center font-medium text-gray-400 border-r border-gray-100">{idx + 1}</td>
                                                        <td className="px-4 py-2.5 font-semibold text-gray-800">{dept}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => {
                                                                        if (idx === 0) return;
                                                                        const depts = [...config.departments];
                                                                        [depts[idx], depts[idx - 1]] = [depts[idx - 1], depts[idx]];
                                                                        updateConfig({ departments: depts });
                                                                    }}
                                                                    disabled={idx === 0}
                                                                    title="Di chuyển lên"
                                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 disabled:opacity-20 transition-colors"
                                                                >
                                                                    <ArrowUp className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        if (idx === (config.departments || []).length - 1) return;
                                                                        const depts = [...(config.departments || [])];
                                                                        [depts[idx], depts[idx + 1]] = [depts[idx + 1], depts[idx]];
                                                                        updateConfig({ departments: depts });
                                                                    }}
                                                                    disabled={idx === (config.departments || []).length - 1}
                                                                    title="Di chuyển xuống"
                                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 disabled:opacity-20 transition-colors"
                                                                >
                                                                    <ArrowDown className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const depts = config.departments.filter((_, i) => i !== idx);
                                                                    updateConfig({ departments: depts });
                                                                }}
                                                                title="Xóa"
                                                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
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
                                <div className="text-xs text-gray-500 px-1">
                                    Đang hiển thị <span className="font-semibold text-gray-700">{(config.departments || []).length}</span> khoa, phòng
                                </div>
                            </div>
                        )}

                        {/* Subtab 3: Nhân viên y tế */}
                        {staffSubTab === 'staff-list' && (
                            <div className="space-y-4 p-1">
                                {/* Header: Title + Excel Buttons */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                            <Users className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-800 text-sm">Danh sách nhân viên y tế</h4>
                                            <p className="text-[11px] text-gray-400">Quản lý nhân sự phẫu thuật, gây mê và phụ tá ({staffList.length} nhân sự)</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleExportExcel}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all shadow-sm"
                                        >
                                            <Download className="h-3.5 w-3.5 text-gray-500" /> Xuất Excel
                                        </button>
                                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-all shadow-sm">
                                            <Upload className="h-3.5 w-3.5" /> Import Excel
                                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                                        </label>
                                    </div>
                                </div>

                                {/* Compact Add / Edit Form */}
                                <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm space-y-2.5">
                                    <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                                        <span>{editingStaffId ? 'Chỉnh sửa thông tin nhân sự' : 'Thêm nhân sự mới'}</span>
                                        {editingStaffId && (
                                            <span className="text-[11px] font-normal text-amber-600">Đang chọn sửa dòng #{staffList.findIndex(s => s.id === editingStaffId) + 1}</span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Họ tên nhân viên <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                value={staffForm.name}
                                                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                                                placeholder="Nguyễn Văn A"
                                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Vị trí mổ</label>
                                            <select
                                                value={staffForm.position}
                                                onChange={(e) => setStaffForm({ ...staffForm, position: e.target.value as any })}
                                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                                            >
                                                <option value="">-- Chọn vị trí --</option>
                                                <option value="BS PT">BS PT</option>
                                                <option value="BS GMHS">BS GMHS</option>
                                                <option value="Phụ">Phụ (KTV/DDC/GV)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Mã số thuế TNCN</label>
                                            <input
                                                type="text"
                                                value={staffForm.taxId}
                                                onChange={(e) => setStaffForm({ ...staffForm, taxId: e.target.value })}
                                                placeholder="Nhập MST..."
                                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Khoa / Phòng</label>
                                            <select
                                                value={staffForm.department}
                                                onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                                            >
                                                <option value="">-- Chọn khoa phòng --</option>
                                                {(config.departments || []).map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex justify-end items-center gap-2 pt-1 border-t border-gray-100">
                                        {editingStaffId ? (
                                            <>
                                                <button
                                                    onClick={resetStaffForm}
                                                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                >
                                                    Hủy bỏ
                                                </button>
                                                <button
                                                    onClick={handleNextStaff}
                                                    className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all flex items-center gap-1"
                                                    title="Lưu và chuyển đến nhân viên tiếp theo"
                                                >
                                                    <ChevronRight className="h-3.5 w-3.5" /> Lưu, Kế tiếp &gt;&gt;
                                                </button>
                                                <button
                                                    onClick={handleSaveStaff}
                                                    disabled={!staffForm.name.trim()}
                                                    className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1 shadow-sm"
                                                >
                                                    <Save className="h-3.5 w-3.5" /> Lưu thay đổi
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={handleSaveStaff}
                                                disabled={!staffForm.name.trim()}
                                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1 shadow-sm"
                                            >
                                                <UserPlus className="h-3.5 w-3.5" /> Thêm nhân sự
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Search bar above table */}
                                <div className="relative w-full md:w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        placeholder="Tìm theo tên, vị trí, khoa, MST..."
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>

                                {/* Staff Table */}
                                <div className="overflow-hidden border border-gray-200 rounded-xl bg-white shadow-sm">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-3 py-2.5 w-12 text-center text-gray-500 font-semibold border-r border-gray-100">STT</th>
                                                <th className="px-3 py-2.5 text-gray-600 font-semibold border-r border-gray-100">Họ tên nhân viên</th>
                                                <th className="px-3 py-2.5 w-28 text-center text-gray-500 font-semibold border-r border-gray-100">Vị trí</th>
                                                <th className="px-3 py-2.5 w-36 text-gray-500 font-semibold border-r border-gray-100">MST TNCN</th>
                                                <th className="px-3 py-2.5 text-gray-500 font-semibold border-r border-gray-100">Khoa / Phòng</th>
                                                <th className="px-3 py-2.5 w-16 text-center text-gray-500 font-semibold">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {paginatedStaff.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic text-sm">
                                                        {searchQuery ? "Không tìm thấy nhân viên nào phù hợp." : "Chưa có nhân viên nào trong danh sách. Hãy thêm mới hoặc import từ file Excel."}
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedStaff.map((staff, pIdx) => {
                                                    const globalIdx = (currentPage - 1) * pageSize + pIdx;
                                                    return (
                                                        <tr
                                                            key={staff.id}
                                                            onClick={() => handleEditStaff(staff)}
                                                            className={`cursor-pointer transition-colors ${
                                                                editingStaffId === staff.id
                                                                    ? 'bg-blue-50/70 font-medium'
                                                                    : 'hover:bg-gray-50/70'
                                                            }`}
                                                        >
                                                            <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-100">{globalIdx + 1}</td>
                                                            <td className="px-3 py-2 font-semibold text-gray-800 border-r border-gray-100">{staff.name}</td>
                                                            <td className="px-3 py-2 text-center border-r border-gray-100">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                                                    staff.position === 'BS PT'
                                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                        : staff.position === 'BS GMHS'
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                                                }`}>
                                                                    {staff.position || 'Chưa chọn'}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-600 font-mono border-r border-gray-100">{staff.taxId || "—"}</td>
                                                            <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{staff.department || "—"}</td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteStaff(staff.id);
                                                                    }}
                                                                    title="Xóa"
                                                                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination below table */}
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-gray-400">Số dòng:</span>
                                            <select
                                                value={pageSize}
                                                onChange={(e) => {
                                                    setPageSize(Number(e.target.value));
                                                    setCurrentPage(1);
                                                }}
                                                className="px-2 py-0.5 border border-gray-200 rounded text-xs font-semibold bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                            >
                                                {[10, 20, 30, 50, 100].map(size => (
                                                    <option key={size} value={size}>{size}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <span>
                                            Đang xem {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredStaffList.length)} trong tổng số {filteredStaffList.length} nhân viên
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="text-xs font-semibold px-1.5 min-w-[70px] text-center">
                                            {currentPage} / {Math.max(1, totalPages)}
                                        </span>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage >= totalPages}
                                            className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                                        >
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}



            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <button
                    onClick={resetConfig}
                    className="text-red-600 text-sm hover:underline flex items-center gap-1 font-medium"
                >
                    <RefreshCw className="h-4 w-4" /> Khôi phục mặc định
                </button>
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                    <Save className="h-3 w-3 text-green-500" />
                    Tự động lưu thay đổi
                </div>
            </div>
        </div >
    );
};
