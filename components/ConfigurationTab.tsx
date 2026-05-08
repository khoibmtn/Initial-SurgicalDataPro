import React, { useState, useEffect, useMemo } from 'react';
import { Save, RefreshCw, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown, Download, Upload, UserPlus, Edit3, XCircle, ChevronRight, Search, ChevronLeft, Building2, Layers, Users, ClipboardList, Activity, Clock, Pencil, Check, Cpu, ToggleLeft, ToggleRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig, RolePrice } from '../contexts/ConfigContext';
import { MachineEntry, StaffMember } from '../types';
import { reportService } from '../services/reportService';

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
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'machines' | 'registry' | 'staff'>('norms');
    const [newMachineName, setNewMachineName] = useState("");
    const [editingMachineIndex, setEditingMachineIndex] = useState<number | null>(null);
    const [editingPriceRow, setEditingPriceRow] = useState<string | null>(null);
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

    useEffect(() => {
        setMachineCurrentPage(1);
    }, [machineSearchQuery]);

    // ────────── Machine Registry (Mã máy) Handlers ──────────
    const registry = config.machineRegistry || [];

    const filteredRegistry = useMemo(() => {
        if (!regSearchQuery.trim()) return registry;
        const q = regSearchQuery.toLowerCase().trim();
        return registry.filter(m =>
            m.machineId.toLowerCase().includes(q) ||
            m.machineCode.toLowerCase().includes(q) ||
            m.machineName.toLowerCase().includes(q)
        );
    }, [registry, regSearchQuery]);

    const totalRegPages = Math.ceil(filteredRegistry.length / regPageSize);
    const paginatedRegistry = filteredRegistry.slice(
        (regCurrentPage - 1) * regPageSize,
        regCurrentPage * regPageSize
    );

    useEffect(() => { setRegCurrentPage(1); }, [regSearchQuery]);

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

            {/* Compact Tab Navigation */}
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-gray-200 bg-gray-50/50">
                {([
                    { key: 'norms', label: 'Định mức & Phụ cấp', icon: ClipboardList },
                    { key: 'machines', label: 'PTTT không dùng máy', icon: Activity },
                    { key: 'registry', label: 'Mã máy', icon: Cpu },
                    { key: 'staff', label: 'Nhân sự', icon: Users },
                ] as const).map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeSubTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveSubTab(tab.key as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${isActive
                                ? 'bg-white text-primary-800 shadow-sm border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                            }`}
                        >
                            <TabIcon className={`h-3.5 w-3.5 ${isActive ? 'text-primary-700' : ''}`} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content area */}
            <div className="p-4 flex-1 overflow-y-auto bg-white">

                {activeSubTab === 'norms' && (
                    <div className="animate-fade-in">
                        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                            <table className="w-full text-sm text-gray-700">
                                <thead>
                                    <tr className="bg-primary-800 text-white text-xs font-bold uppercase">
                                        <th rowSpan={2} className="px-5 py-3 text-left min-w-[180px] align-middle">Loại PTTT</th>
                                        <th colSpan={3} className="px-4 py-2 text-center border-l border-primary-700/40">Phụ cấp PTTT (đồng)</th>
                                        <th colSpan={2} className="px-4 py-2 text-center border-l border-primary-700/40">Thời gian (phút)</th>
                                        <th rowSpan={2} className="px-3 py-3 w-[50px] border-l border-primary-700/40"></th>
                                    </tr>
                                    <tr className="bg-primary-700/80 text-white text-xs font-semibold">
                                        <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Chính</th>
                                        <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Phụ</th>
                                        <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Giúp việc</th>
                                        <th className="px-4 py-2 text-center w-[90px] border-l border-primary-600/30">Tối thiểu</th>
                                        <th className="px-4 py-2 text-center w-[90px] border-l border-primary-600/30">Tối đa</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    <tr className="bg-primary-50/60">
                                        <td colSpan={7} className="px-5 py-2.5 text-primary-800 uppercase text-xs font-bold tracking-wider">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                                                Phẫu thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {SURGERY_TYPES.map((type) => {
                                        const isEditing = editingPriceRow === type;
                                        return (
                                            <tr key={type} className={`transition-all duration-150 ${isEditing ? 'bg-primary-50/80 ring-1 ring-primary-200 ring-inset' : 'hover:bg-gray-50/80'}`}>
                                                <td className="px-5 py-3 font-medium text-gray-700 pl-8">
                                                    {type === 'PĐB' ? 'Loại Đặc biệt' : type.replace("P", "Loại ")}
                                                </td>
                                                {isEditing ? (
                                                    <>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Chính')} onChange={(val) => handlePriceChange(type, 'Chính', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-primary-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Phụ')} onChange={(val) => handlePriceChange(type, 'Phụ', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-primary-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Giúp việc')} onChange={(val) => handlePriceChange(type, 'Giúp việc', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-primary-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getTime(type, 'min')} onChange={(val) => handleTimeChange(type, 'min', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getTime(type, 'max')} onChange={(val) => handleTimeChange(type, 'max', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center">
                                                            <button onClick={() => setEditingPriceRow(null)} className="p-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm" title="Xong">
                                                                <Check className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Chính').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Phụ').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Giúp việc').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(type, 'min').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(type, 'max').toLocaleString()}</td>
                                                        <td className="px-2 py-3 text-center">
                                                            <button onClick={() => setEditingPriceRow(type)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Sửa">
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-teal-50/60">
                                        <td colSpan={7} className="px-5 py-2.5 text-teal-800 uppercase text-xs font-bold tracking-wider">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                                                Thủ thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {PROCEDURE_TYPES.map((type) => {
                                        const isEditing = editingPriceRow === type;
                                        return (
                                            <tr key={type} className={`transition-all duration-150 ${isEditing ? 'bg-teal-50/80 ring-1 ring-teal-200 ring-inset' : 'hover:bg-gray-50/80'}`}>
                                                <td className="px-5 py-3 font-medium text-gray-700 pl-8">
                                                    {type === 'TĐB' ? 'Loại Đặc biệt' : type === 'TKPL' ? 'Không phân loại' : type.replace("T", "Loại ")}
                                                </td>
                                                {isEditing ? (
                                                    <>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Chính')} onChange={(val) => handlePriceChange(type, 'Chính', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-teal-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Phụ')} onChange={(val) => handlePriceChange(type, 'Phụ', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-teal-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getPrice(type, 'Giúp việc')} onChange={(val) => handlePriceChange(type, 'Giúp việc', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-teal-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getTime(type, 'min')} onChange={(val) => handleTimeChange(type, 'min', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            <NumberInput value={getTime(type, 'max')} onChange={(val) => handleTimeChange(type, 'max', val)} className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
                                                        </td>
                                                        <td className="px-2 py-1.5 text-center">
                                                            <button onClick={() => setEditingPriceRow(null)} className="p-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm" title="Xong">
                                                                <Check className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Chính').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Phụ').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{getPrice(type, 'Giúp việc').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(type, 'min').toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(type, 'max').toLocaleString()}</td>
                                                        <td className="px-2 py-3 text-center">
                                                            <button onClick={() => setEditingPriceRow(type)} className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Sửa">
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t bg-blue-50 mt-6 rounded-lg border-blue-100">
                            <h3 className="font-bold text-lg text-primary-900 mb-2">Định mức bàn mổ</h3>
                            <div className="overflow-x-auto border border-primary-200 rounded-lg shadow-sm bg-white">
                                <table className="w-full text-sm">
                                    <thead className="bg-primary-100 text-primary-900 font-bold text-left">
                                        <tr>
                                            <th className="px-4 py-3 border-r border-primary-200">Đối tượng</th>
                                            <th className="px-4 py-3 text-center">Tùy chọn kiểm tra trùng giờ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-primary-100">
                                        {[
                                            { label: "Bác sĩ phẫu thuật (PT chính, PT phụ)", key: "surgeons" as const },
                                            { label: "Bác sĩ gây mê hồi sức", key: "anesthesiologists" as const },
                                            { label: "KTV gây mê, Tít dụng cụ", key: "support" as const },
                                            { label: "Giúp việc", key: "assistants" as const }
                                        ].map((row, idx) => (
                                            <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-primary-50/30'}>
                                                <td className="px-4 py-3 border-r border-primary-100 font-medium text-gray-700">{row.label}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <select
                                                        value={config.staffLimits?.[row.key] ?? 1}
                                                        onChange={(e) => {
                                                            const val = Number(e.target.value) as any;
                                                            updateConfig({
                                                                staffLimits: {
                                                                    ...config.staffLimits,
                                                                    [row.key]: val
                                                                }
                                                            });
                                                        }}
                                                        className="border-gray-300 rounded-md shadow-sm text-sm px-3 pr-9 py-1.5 min-w-[240px]"
                                                    >
                                                        <option value={0}>Không kiểm tra trùng giờ</option>
                                                        <option value={1}>Tối đa 1 bàn mổ (1 ca)</option>
                                                        <option value={2}>Tối đa 2 bàn mổ (2 ca)</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeSubTab === 'machines' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-yellow-800">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-bold mb-1">Cấu hình bỏ qua lỗi thiếu máy</p>
                                <p>Nhập tên của phẫu thuật/thủ thuật để hệ thống không báo lỗi "Thiếu mã máy".</p>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-gray-900">Danh sách tên PTTT bỏ qua kiểm tra máy</h4>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleExportMachines}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-all shadow-sm"
                                    >
                                        <Download className="h-3.5 w-3.5" /> Xuất Excel
                                    </button>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer transition-all shadow-sm">
                                        <Upload className="h-3.5 w-3.5" /> Import Excel
                                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportMachines} />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6 mb-6">
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 mb-1 tracking-tight">Tên Phẫu thuật / Thủ thuật</label>
                                        <input
                                            type="text"
                                            value={newMachineName}
                                            onChange={(e) => setNewMachineName(e.target.value)}
                                            placeholder="Nhập tên PTTT cần bỏ qua kiểm tra máy..."
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    editingMachineIndex !== null ? handleSaveMachineName() : handleAddMachineName();
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <button
                                            onClick={handleSaveMachineName}
                                            disabled={editingMachineIndex === null}
                                            className={`px-4 py-2 font-bold rounded-lg flex items-center gap-2 border transition-all shadow-sm min-w-[140px] justify-center ${editingMachineIndex !== null
                                                ? 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600'
                                                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                }`}
                                        >
                                            <Save className="h-4 w-4" /> Lưu thay đổi
                                        </button>
                                        <button
                                            onClick={handleAddMachineName}
                                            disabled={!newMachineName.trim() || config.ignoredMachineNames.includes(newMachineName.trim())}
                                            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 border border-emerald-700 transition-all shadow-sm flex items-center gap-2"
                                        >
                                            <Plus className="h-4 w-4" /> Thêm
                                        </button>
                                        {editingMachineIndex !== null && (
                                            <button
                                                onClick={() => {
                                                    setEditingMachineIndex(null);
                                                    setNewMachineName("");
                                                }}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                title="Hủy sửa"
                                            >
                                                <XCircle className="h-6 w-6" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Tìm kiếm:</label>
                                    <div className="relative w-full md:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={machineSearchQuery}
                                            onChange={(e) => setMachineSearchQuery(e.target.value)}
                                            placeholder="Tên phẫu thuật, thủ thuật..."
                                            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-tight">Số dòng:</label>
                                        <select
                                            value={machinePageSize}
                                            onChange={(e) => {
                                                setMachinePageSize(Number(e.target.value));
                                                setMachineCurrentPage(1);
                                            }}
                                            className="px-3 pr-8 py-1 text-xs border border-gray-300 rounded-md bg-white font-bold text-emerald-900 focus:ring-1 focus:ring-emerald-500 outline-none min-w-[70px]"
                                        >
                                            {[10, 20, 30, 50, 100].map(size => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="text-xs text-gray-500 font-medium">
                                        Hiển thị {paginatedMachines.length} / {filteredMachines.length} bản ghi
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setMachineCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={machineCurrentPage === 1}
                                            className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <div className="text-sm font-bold text-emerald-900 px-2 min-w-[100px] text-center">
                                            Trang {machineCurrentPage} / {Math.max(1, totalMachinePages)}
                                        </div>
                                        <button
                                            onClick={() => setMachineCurrentPage(prev => Math.min(totalMachinePages, prev + 1))}
                                            disabled={machineCurrentPage >= totalMachinePages}
                                            className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-hidden border border-gray-200 rounded-xl shadow-sm bg-white">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-emerald-700 text-white font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3 w-[70px] text-center border-r border-emerald-600">STT</th>
                                            <th className="px-4 py-3 border-r border-emerald-600">Tên Phẫu thuật / Thủ thuật</th>
                                            <th className="px-4 py-3 w-[100px] text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paginatedMachines.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-10 text-center text-gray-400 italic">
                                                    {machineSearchQuery.trim() ? "Không tìm thấy kết quả nào phù hợp." : "Chưa có phẫu thuật nào trong danh sách bỏ qua kiểm tra máy."}
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedMachines.map((name, idx) => {
                                                const globalIdx = (machineCurrentPage - 1) * machinePageSize + idx;
                                                // Find original index in config.ignoredMachineNames for handleEditMachineName
                                                const originalIdx = config.ignoredMachineNames.indexOf(name);

                                                return (
                                                    <tr
                                                        key={`${name}-${idx}`}
                                                        onClick={() => handleEditMachineName(originalIdx)}
                                                        className={`cursor-pointer transition-all ${editingMachineIndex === originalIdx ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-emerald-50`}
                                                    >
                                                        <td className="px-4 py-3 text-center font-bold text-gray-400 border-r">{globalIdx + 1}</td>
                                                        <td className="px-4 py-3 font-bold text-gray-800 border-r">{name}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteMachineName(name);
                                                                }}
                                                                className="p-1.5 rounded-md hover:bg-red-100 text-red-500 transition-colors"
                                                                title="Xóa"
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
                    </div>
                )}

                {activeSubTab === 'registry' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex gap-3 text-teal-800">
                            <Cpu className="h-5 w-5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-bold mb-1">Danh sách mã máy thực hiện PTTT</p>
                                <p>Quản lý danh mục máy: nhập thủ công hoặc import Excel. Mã máy trong file DS PT sẽ được tra cứu tại đây.</p>
                            </div>
                        </div>

                        {/* Import Confirmation Dialog */}
                        {importDialog && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden border border-gray-200">
                                    {/* Header */}
                                    <div className="px-6 py-4 bg-gradient-to-r from-teal-600 to-teal-700 text-white flex items-center gap-3">
                                        <AlertCircle className="h-6 w-6 shrink-0" />
                                        <div>
                                            <h3 className="font-bold text-lg">Xác nhận Import mã máy</h3>
                                            <p className="text-teal-100 text-sm">Đọc được {importDialog.allParsed.length} dòng từ file Excel</p>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                        {/* Overwrite warning */}
                                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex gap-2 text-amber-800">
                                            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                                            <div className="text-sm">
                                                <p className="font-bold">⚠️ Import sẽ GHI ĐÈ toàn bộ dữ liệu mã máy hiện có!</p>
                                                <p className="text-amber-700 mt-1">
                                                    Hiện tại đang có <strong>{registry.length}</strong> mã máy trong hệ thống.
                                                    Sau khi import, dữ liệu cũ sẽ bị thay thế hoàn toàn bởi <strong>{importDialog.cleanEntries.length}</strong> mã máy từ file.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Duplicate warnings */}
                                        {importDialog.duplicatesInFile.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-red-800">
                                                    <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                                                    <div className="text-sm">
                                                        <p className="font-bold">Phát hiện {importDialog.duplicatesInFile.length} dòng trùng mã máy trong file!</p>
                                                        <p className="text-red-600">Các dòng bên dưới có mã máy trùng với dòng trước đó. Nếu tiếp tục, chỉ dòng đầu tiên sẽ được giữ lại.</p>
                                                    </div>
                                                </div>

                                                <div className="overflow-auto max-h-[250px] border border-gray-200 rounded-lg">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-red-100 text-red-800 font-bold uppercase sticky top-0">
                                                            <tr>
                                                                <th className="px-3 py-2 text-center w-[70px] border-r">Dòng Excel</th>
                                                                <th className="px-3 py-2 w-[100px] border-r">ID máy</th>
                                                                <th className="px-3 py-2 w-[120px] border-r">Mã máy</th>
                                                                <th className="px-3 py-2 border-r">Tên máy</th>
                                                                <th className="px-3 py-2 w-[90px] border-r">Trạng thái</th>
                                                                <th className="px-3 py-2 w-[90px]">Trùng dòng</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {importDialog.duplicatesInFile.map((dup, idx) => (
                                                                <tr key={idx} className="bg-red-50/50 hover:bg-red-50">
                                                                    <td className="px-3 py-2 text-center font-bold text-red-600 border-r">{dup.rowNum}</td>
                                                                    <td className="px-3 py-2 font-mono text-gray-600 border-r">{dup.entry.machineId || '—'}</td>
                                                                    <td className="px-3 py-2 font-bold text-red-700 border-r">{dup.entry.machineCode}</td>
                                                                    <td className="px-3 py-2 text-gray-700 border-r">{dup.entry.machineName || '—'}</td>
                                                                    <td className="px-3 py-2 text-center border-r">
                                                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${dup.entry.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                            {dup.entry.active ? 'Sử dụng' : 'Tắt'}
                                                                        </span>
                                                                    </td>
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
                                                <div className="text-sm">
                                                    <p className="font-bold">✓ Không có mã máy nào trùng lặp trong file</p>
                                                    <p className="text-green-600">Tất cả {importDialog.cleanEntries.length} mã máy đều duy nhất.</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Summary */}
                                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                                            <p><strong>Tóm tắt:</strong> {importDialog.cleanEntries.length} mã máy sẽ được import
                                                {importDialog.duplicatesInFile.length > 0 && <span className="text-red-600"> ({importDialog.duplicatesInFile.length} dòng trùng sẽ bị loại)</span>}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => handleConfirmImport('cancel')}
                                            className="px-5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-all"
                                        >
                                            Hủy — Sửa file rồi import lại
                                        </button>
                                        <button
                                            onClick={() => handleConfirmImport('overwrite_clean')}
                                            className="px-5 py-2 text-sm font-bold text-white bg-teal-600 border border-teal-700 rounded-lg hover:bg-teal-700 transition-all shadow-sm"
                                        >
                                            Import {importDialog.cleanEntries.length} mã máy (ghi đè)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Import/Export Buttons */}
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-gray-900">Danh sách máy ({registry.length} máy, {registry.filter(m => m.active).length} đang sử dụng)</h4>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportRegistry}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 bg-white border border-teal-200 rounded-lg hover:bg-teal-50 transition-all shadow-sm"
                                >
                                    <Download className="h-3.5 w-3.5" /> Xuất Excel
                                </button>
                                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 cursor-pointer transition-all shadow-sm">
                                    <Upload className="h-3.5 w-3.5" /> Import Excel
                                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportRegistry} />
                                </label>
                            </div>
                        </div>

                        {/* Backfill Section */}
                        <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                        <RefreshCw className={`h-5 w-5 text-indigo-600 ${backfillRunning ? 'animate-spin' : ''}`} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Backfill dữ liệu lưu trữ</h4>
                                        <p className="text-xs text-gray-500">Bổ sung mã máy & ID máy cho bản ghi cũ dựa vào tên máy</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleBackfill}
                                    disabled={backfillRunning || registry.length === 0}
                                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-sm ${
                                        backfillRunning || registry.length === 0
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${backfillRunning ? 'animate-spin' : ''}`} />
                                    {backfillRunning ? 'Đang xử lý...' : 'Chạy Backfill'}
                                </button>
                            </div>

                            {/* Progress */}
                            {backfillProgress && (
                                <div className="mt-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700 font-medium">
                                    {backfillProgress}
                                </div>
                            )}

                            {/* Result */}
                            {backfillResult && (
                            <>
                                <div className="mt-3 grid grid-cols-6 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-gray-800">{backfillResult.totalScanned}</p>
                                        <p className="text-[10px] text-gray-500 font-bold">Tổng quét</p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-green-600">{backfillResult.matched}</p>
                                        <p className="text-[10px] text-green-600 font-bold">Khớp</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-blue-600">{backfillResult.alreadyFilled}</p>
                                        <p className="text-[10px] text-blue-600 font-bold">Đã có sẵn</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-slate-500">{backfillResult.noMachine}</p>
                                        <p className="text-[10px] text-slate-500 font-bold">Không có tên máy</p>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-amber-600">{backfillResult.unmatched}</p>
                                        <p className="text-[10px] text-amber-600 font-bold">Không khớp</p>
                                    </div>
                                    <div className="bg-teal-50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-teal-600">{backfillResult.updated}</p>
                                        <p className="text-[10px] text-teal-600 font-bold">Đã cập nhật</p>
                                    </div>
                                </div>

                                {/* Unmatched names list */}
                                {backfillResult.unmatchedNames.length > 0 && (
                                    <div className="mt-3">
                                        <p className="text-xs font-bold text-amber-700 mb-2">
                                            Danh sách {backfillResult.unmatchedNames.length} tên máy không khớp:
                                        </p>
                                        <div className="overflow-auto max-h-[250px] border border-amber-200 rounded-lg">
                                            <table className="w-full text-xs">
                                                <thead className="bg-amber-100 text-amber-800 font-bold uppercase sticky top-0">
                                                    <tr>
                                                        <th className="px-3 py-2 text-center w-[50px] border-r">STT</th>
                                                        <th className="px-3 py-2 text-left border-r">Tên máy trong dữ liệu</th>
                                                        <th className="px-3 py-2 text-center w-[80px]">Số bản ghi</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {backfillResult.unmatchedNames.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-amber-50/50">
                                                            <td className="px-3 py-1.5 text-center text-gray-400 border-r">{idx + 1}</td>
                                                            <td className="px-3 py-1.5 font-medium text-gray-700 border-r">{item.name}</td>
                                                            <td className="px-3 py-1.5 text-center font-bold text-amber-600">{item.count}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </>
                            )}
                        </div>

                        {/* Add/Edit Form */}
                        <div className="bg-white rounded-xl shadow-sm border border-teal-200 p-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">ID máy</label>
                                    <input
                                        type="text"
                                        value={regForm.machineId}
                                        onChange={(e) => setRegForm({ ...regForm, machineId: e.target.value })}
                                        placeholder="VD: M001"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Mã máy <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={regForm.machineCode}
                                        onChange={(e) => setRegForm({ ...regForm, machineCode: e.target.value })}
                                        placeholder="VD: NS-001 (duy nhất)"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Tên máy</label>
                                    <input
                                        type="text"
                                        value={regForm.machineName}
                                        onChange={(e) => setRegForm({ ...regForm, machineName: e.target.value })}
                                        placeholder="VD: Nội soi Karl Storz"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
                                    />
                                </div>
                                <div className="flex items-end gap-2">
                                    {editingRegId ? (
                                        <>
                                            <button
                                                onClick={handleSaveRegistry}
                                                className="px-4 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 border border-orange-600 transition-all shadow-sm flex items-center gap-2"
                                            >
                                                <Save className="h-4 w-4" /> Lưu
                                            </button>
                                            <button
                                                onClick={() => { setEditingRegId(null); setRegForm({ machineId: "", machineCode: "", machineName: "", active: true }); }}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                                title="Hủy"
                                            >
                                                <XCircle className="h-6 w-6" />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={handleAddRegistry}
                                            disabled={!regForm.machineCode.trim()}
                                            className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 border border-teal-700 transition-all shadow-sm flex items-center gap-2"
                                        >
                                            <Plus className="h-4 w-4" /> Thêm
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Search & Pagination */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Tìm kiếm:</label>
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={regSearchQuery}
                                        onChange={(e) => setRegSearchQuery(e.target.value)}
                                        placeholder="ID, mã hoặc tên máy..."
                                        className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-tight">Số dòng:</label>
                                    <select
                                        value={regPageSize}
                                        onChange={(e) => { setRegPageSize(Number(e.target.value)); setRegCurrentPage(1); }}
                                        className="px-3 pr-8 py-1 text-xs border border-gray-300 rounded-md bg-white font-bold text-teal-900 focus:ring-1 focus:ring-teal-500 outline-none min-w-[70px]"
                                    >
                                        {[10, 20, 30, 50, 100].map(size => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="text-xs text-gray-500 font-medium">
                                    Hiển thị {paginatedRegistry.length} / {filteredRegistry.length} bản ghi
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setRegCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={regCurrentPage === 1}
                                        className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <div className="text-sm font-bold text-teal-900 px-2 min-w-[100px] text-center">
                                        Trang {regCurrentPage} / {Math.max(1, totalRegPages)}
                                    </div>
                                    <button
                                        onClick={() => setRegCurrentPage(prev => Math.min(totalRegPages, prev + 1))}
                                        disabled={regCurrentPage >= totalRegPages}
                                        className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Data Table */}
                        <div className="overflow-hidden border border-gray-200 rounded-xl shadow-sm bg-white">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-teal-700 text-white font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3 w-[60px] text-center border-r border-teal-600">STT</th>
                                        <th className="px-4 py-3 w-[120px] border-r border-teal-600">ID máy</th>
                                        <th className="px-4 py-3 w-[150px] border-r border-teal-600">Mã máy</th>
                                        <th className="px-4 py-3 border-r border-teal-600">Tên máy</th>
                                        <th className="px-4 py-3 w-[110px] text-center border-r border-teal-600">Trạng thái</th>
                                        <th className="px-4 py-3 w-[100px] text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {paginatedRegistry.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic">
                                                {regSearchQuery.trim() ? "Không tìm thấy kết quả nào phù hợp." : "Chưa có mã máy nào. Hãy thêm hoặc import từ Excel."}
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedRegistry.map((entry, idx) => {
                                            const globalIdx = (regCurrentPage - 1) * regPageSize + idx;
                                            return (
                                                <tr
                                                    key={entry.id}
                                                    onClick={() => handleEditRegistry(entry)}
                                                    className={`cursor-pointer transition-all ${editingRegId === entry.id ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-teal-50 ${!entry.active ? 'opacity-50' : ''}`}
                                                >
                                                    <td className="px-4 py-3 text-center font-bold text-gray-400 border-r">{globalIdx + 1}</td>
                                                    <td className="px-4 py-3 font-mono text-gray-700 border-r">{entry.machineId || '—'}</td>
                                                    <td className="px-4 py-3 font-bold text-teal-800 border-r">{entry.machineCode}</td>
                                                    <td className="px-4 py-3 text-gray-800 border-r">{entry.machineName || '—'}</td>
                                                    <td className="px-4 py-3 text-center border-r">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleActiveRegistry(entry.id); }}
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${entry.active
                                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                                }`}
                                                        >
                                                            {entry.active
                                                                ? <><ToggleRight className="h-3.5 w-3.5" /> Sử dụng</>
                                                                : <><ToggleLeft className="h-3.5 w-3.5" /> Tắt</>
                                                            }
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteRegistry(entry.id); }}
                                                            className="p-1.5 rounded-md hover:bg-red-100 text-red-500 transition-colors"
                                                            title="Xóa"
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
                )}

                {activeSubTab === 'staff' && (
                    <div className="space-y-8 animate-fade-in pb-20">
                        <div>
                            {/* Section: Hospital Name */}
                            <div className="flex items-center gap-4 mb-8">
                                <div className="flex items-center gap-3 min-w-fit">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                                        <Building2 className="h-5 w-5" />
                                    </div>
                                    <h3 className="font-bold text-lg text-blue-900 whitespace-nowrap">Tên Bệnh viện:</h3>
                                </div>

                                <div className="flex-1 flex gap-3 items-center">
                                    <input
                                        type="text"
                                        value={config.hospitalName || ""}
                                        onChange={(e) => updateConfig({ hospitalName: e.target.value })}
                                        placeholder="Nhập tên bệnh viện hiển thị trên báo cáo..."
                                        className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-medium text-blue-900 bg-white"
                                    />
                                    <div className="flex items-center gap-1.5 text-blue-400 select-none">
                                        <Save className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-bold italic tracking-wider uppercase opacity-80">Tự động lưu</span>
                                    </div>
                                </div>
                            </div>
                            {/* Section: Working Hours - INSERT THIS AFTER LINE 874 */}
                            <div className="mb-8">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                                        <Clock className="h-5 w-5" />
                                    </div>
                                    <h3 className="font-bold text-lg text-blue-900">Giờ làm việc:</h3>
                                </div>

                                <div className="overflow-x-auto border border-blue-200 rounded-lg shadow-sm bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-blue-100 text-blue-900 font-bold">
                                            <tr>
                                                <th className="px-4 py-3 border-r border-blue-200 w-[150px]"></th>
                                                <th className="px-4 py-3 border-r border-blue-200 text-center">Mùa hè</th>
                                                <th className="px-4 py-3 text-center">Mùa đông</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-blue-100">
                                            {/* Ngày áp dụng */}
                                            <tr className="bg-white">
                                                <td className="px-4 py-3 border-r border-blue-100 font-medium text-gray-700">Ngày áp dụng</td>
                                                <td className="px-4 py-3 border-r border-blue-100">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                            className="w-[90px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">Đến</span>
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
                                                            className="w-[90px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                            className="w-[90px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">Đến</span>
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
                                                            className="w-[90px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Buổi sáng */}
                                            <tr className="bg-blue-50/30">
                                                <td className="px-4 py-3 border-r border-blue-100 font-medium text-gray-700">Buổi sáng</td>
                                                <td className="px-4 py-3 border-r border-blue-100">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                                // Reset if incomplete or invalid (00:00)
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">đến</span>
                                                        <input
                                                            type="text"
                                                            value={config.workingHours?.summer.morningTo || ""}
                                                            onChange={(e) => {
                                                                handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                    // Validate: morningTo must be > morningFrom
                                                                    const fromTime = config.workingHours?.summer.morningFrom || "";
                                                                    if (formatted.length === 5 && !isTimeBefore(fromTime, formatted)) {
                                                                        // Invalid: show warning or don't update
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
                                                                // Reset if incomplete (not 5 chars) or invalid (toTime <= fromTime or 00:00)
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">đến</span>
                                                        <input
                                                            type="text"
                                                            value={config.workingHours?.winter.morningTo || ""}
                                                            onChange={(e) => {
                                                                handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                    // Validate: morningTo must be > morningFrom
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
                                                                // Reset if incomplete or invalid
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Buổi chiều */}
                                            <tr className="bg-white">
                                                <td className="px-4 py-3 border-r border-blue-100 font-medium text-gray-700">Buổi chiều</td>
                                                <td className="px-4 py-3 border-r border-blue-100">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">đến</span>
                                                        <input
                                                            type="text"
                                                            value={config.workingHours?.summer.afternoonTo || ""}
                                                            onChange={(e) => {
                                                                handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                    // Validate: afternoonTo must be > afternoonFrom
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
                                                                // Reset if incomplete or invalid
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="text-gray-600 font-medium">Từ</span>
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
                                                                            winter: { ...config.workingHours?.winter, afternoonFrom: "13:30" } as any
                                                                        }
                                                                    });
                                                                }
                                                            }}
                                                            maxLength={5}
                                                            placeholder="HH:mm"
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                        <span className="text-gray-600 font-medium">đến</span>
                                                        <input
                                                            type="text"
                                                            value={config.workingHours?.winter.afternoonTo || ""}
                                                            onChange={(e) => {
                                                                handleWorkingHoursTimeChange(e.target.value, (formatted) => {
                                                                    // Validate: afternoonTo must be > afternoonFrom
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
                                                                // Reset if incomplete or invalid
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
                                                            className="w-[100px] px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-4 w-full md:w-auto">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                                            <Layers className="h-5 w-5" />
                                        </div>
                                        <h3 className="font-bold text-lg text-blue-900 whitespace-nowrap">Danh sách khoa phòng:</h3>
                                    </div>
                                    <div className="flex-1 md:w-80 flex gap-2">
                                        <input
                                            type="text"
                                            value={newDeptName}
                                            onChange={(e) => setNewDeptName(e.target.value)}
                                            placeholder="Nhập tên khoa, phòng cần bổ sung..."
                                            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm h-10"
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
                                            className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                                        >
                                            <Plus className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-hidden border border-gray-200 rounded-xl shadow-sm mb-12">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-blue-900 text-white font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3 w-[80px] text-center border-r border-blue-800">STT</th>
                                            <th className="px-4 py-3 border-r border-blue-800">Tên khoa, phòng</th>
                                            <th className="px-4 py-3 w-[150px] text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {(config.departments || []).length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-10 text-center text-gray-400 italic">
                                                    Chưa có khoa phòng nào trong danh sách.
                                                </td>
                                            </tr>
                                        ) : (
                                            (config.departments || []).map((dept, idx) => (
                                                <tr key={dept} className={`hover:bg-blue-50/50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                    <td className="px-4 py-3 text-center font-bold text-gray-500 border-r">{idx + 1}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-800 border-r">{dept}</td>
                                                    <td className="px-4 py-2">
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
                                                                className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 disabled:opacity-20"
                                                            >
                                                                <ArrowUp className="h-4 w-4" />
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
                                                                className="p-1.5 rounded-md hover:bg-blue-100 text-blue-600 disabled:opacity-20"
                                                            >
                                                                <ArrowDown className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const depts = config.departments.filter((_, i) => i !== idx);
                                                                    updateConfig({ departments: depts });
                                                                }}
                                                                title="Xóa"
                                                                className="p-1.5 rounded-md hover:bg-red-100 text-red-500"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Section 2: Medical Staff List */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                        <Users className="h-5 w-5" />
                                    </div>
                                    <h3 className="font-bold text-lg text-blue-900">Danh sách nhân viên y tế</h3>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleExportExcel}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-all shadow-sm"
                                    >
                                        <Download className="h-3.5 w-3.5" /> Xuất Excel
                                    </button>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-all shadow-sm">
                                        <Upload className="h-3.5 w-3.5" /> Import Excel
                                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6 mb-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Họ tên nhân viên</label>
                                        <input
                                            type="text"
                                            value={staffForm.name}
                                            onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                                            placeholder="Nhập họ tên..."
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Vị trí mổ</label>
                                        <select
                                            value={staffForm.position}
                                            onChange={(e) => setStaffForm({ ...staffForm, position: e.target.value as any })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        >
                                            <option value="">-- Chọn vị trí --</option>
                                            <option value="BS PT">BS PT</option>
                                            <option value="BS GMHS">BS GMHS</option>
                                            <option value="Phụ">Phụ (KTV/DDC/GV)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Mã số thuế TNCN</label>
                                        <input
                                            type="text"
                                            value={staffForm.taxId}
                                            onChange={(e) => setStaffForm({ ...staffForm, taxId: e.target.value })}
                                            placeholder="Nhập MST..."
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Khoa / Phòng</label>
                                        <select
                                            value={staffForm.department}
                                            onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        >
                                            <option value="">-- Chọn khoa phòng --</option>
                                            {(config.departments || []).map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    {editingStaffId ? (
                                        <>
                                            <button
                                                onClick={handleSaveStaff}
                                                disabled={!staffForm.name.trim()}
                                                className="px-5 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-all shadow-md border border-orange-600"
                                            >
                                                <Save className="h-5 w-5 inline mr-1" /> Lưu thay đổi
                                            </button>
                                            <button
                                                onClick={handleNextStaff}
                                                className="px-5 py-2 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition-all border border-blue-300"
                                                title="Lưu và chuyển đến nhân viên tiếp theo"
                                            >
                                                <ChevronRight className="h-5 w-5 inline mr-1" /> Lưu, Kế tiếp &gt;&gt;
                                            </button>
                                            <button
                                                onClick={resetStaffForm}
                                                className="px-5 py-2 bg-yellow-100 border border-yellow-300 rounded-lg hover:bg-yellow-200 font-bold text-yellow-700 transition-all"
                                            >
                                                <XCircle className="h-5 w-5 inline mr-1" /> Hủy bỏ
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={handleSaveStaff}
                                            disabled={!staffForm.name.trim()}
                                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md border border-blue-700"
                                        >
                                            <UserPlus className="h-5 w-5 inline mr-1" /> Thêm nhân viên
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Search and Pagination Bar */}
                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Tìm kiếm:</label>
                                    <div className="relative w-full md:w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Tên, vị trí, khoa, MST..."
                                            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-tight">Số dòng:</label>
                                        <select
                                            value={pageSize}
                                            onChange={(e) => {
                                                setPageSize(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="px-3 pr-8 py-1 text-xs border border-gray-300 rounded-md bg-white font-bold text-blue-900 focus:ring-1 focus:ring-blue-500 outline-none min-w-[70px]"
                                        >
                                            {[10, 20, 30, 50, 100].map(size => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="text-xs text-gray-500 font-medium">
                                        Hiển thị {paginatedStaff.length} / {filteredStaffList.length} bản ghi
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <div className="text-sm font-bold text-blue-900 px-2">
                                            Trang {currentPage} / {Math.max(1, totalPages)}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage >= totalPages}
                                            className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm bg-white">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-blue-900 text-white font-bold uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-3 w-[70px] text-center border-r border-blue-800">STT</th>
                                            <th className="px-4 py-3 border-r border-blue-800">Họ tên nhân viên</th>
                                            <th className="px-4 py-3 w-[150px] border-r border-blue-800 text-center">Vị trí</th>
                                            <th className="px-4 py-3 w-[150px] border-r border-blue-800">MST TNCN</th>
                                            <th className="px-4 py-3 border-r border-blue-800">Khoa</th>
                                            <th className="px-4 py-3 w-[100px] text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {paginatedStaff.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic">
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
                                                        className={`cursor-pointer transition-all ${editingStaffId === staff.id ? 'bg-orange-50' : globalIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}
                                                    >
                                                        <td className="px-4 py-3 text-center font-bold text-gray-400 border-r">{globalIdx + 1}</td>
                                                        <td className="px-4 py-3 font-bold text-gray-800 border-r">{staff.name}</td>
                                                        <td className="px-4 py-3 text-center border-r">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${staff.position === 'BS PT' ? 'bg-primary-100 text-primary-700' : staff.position === 'BS GMHS' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                {staff.position}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-600 font-mono border-r">{staff.taxId || "---"}</td>
                                                        <td className="px-4 py-3 text-gray-600 border-r">{staff.department || "---"}</td>
                                                        <td className="px-4 py-2">
                                                            <div className="flex items-center justify-center">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteStaff(staff.id);
                                                                    }}
                                                                    className="p-1.5 rounded-md hover:bg-red-100 text-red-500"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
