import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown, Download, Upload, UserPlus, Edit3, XCircle, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig, RolePrice, StaffMember } from '../contexts/ConfigContext';

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

export const ConfigurationTab: React.FC = () => {
    const { config, updateConfig, resetConfig, isLoaded } = useConfig();
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'machines' | 'staff'>('norms');
    const [newMachineName, setNewMachineName] = useState("");
    const [newDeptName, setNewDeptName] = useState("");

    // Section 2: Medical Staff State
    const [staffForm, setStaffForm] = useState<Omit<StaffMember, 'id'>>({
        name: "",
        position: '',
        taxId: "",
        department: ""
    });
    const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

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
        if (newMachineName.trim() && !config.ignoredMachineNames.includes(newMachineName.trim())) {
            updateConfig({ ignoredMachineNames: [...config.ignoredMachineNames, newMachineName.trim()] });
            setNewMachineName("");
        }
    };

    const SURGERY_TYPES = ["PĐB", "P1", "P2", "P3"];
    const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"];

    const getPrice = (loai: string, role: keyof RolePrice) => config.priceConfig[loai]?.[role] ?? 0;
    const getTime = (loai: string, field: 'min' | 'max') => config.timeRules[loai]?.[field] ?? 0;

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

        // 2. Find next index based on potential new ID after save
        let nextIdx = 0;
        if (currentId) {
            const currentIdx = currentList.findIndex(s => s.id === currentId);
            if (currentIdx !== -1 && currentIdx < currentList.length - 1) {
                nextIdx = currentIdx + 1;
            } else {
                nextIdx = 0;
            }
        }

        handleEditStaff(currentList[nextIdx]);
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
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[600px] flex flex-col font-inter text-sm max-w-6xl mx-auto w-full">

            {/* Tab Navigation */}
            <div className="flex relative">
                <button
                    onClick={() => setActiveSubTab('norms')}
                    className={`flex-1 py-4 text-sm font-bold text-center transition-all border-t-2 border-l border-r ${activeSubTab === 'norms'
                        ? 'bg-indigo-600 text-white border-t-indigo-400 border-l-indigo-300 border-r-indigo-300'
                        : 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200 border-b border-b-indigo-300'
                        }`}
                >
                    Định mức bàn mổ, thời gian, phụ cấp PTTT
                </button>
                <button
                    onClick={() => setActiveSubTab('machines')}
                    className={`flex-1 py-4 text-sm font-bold text-center transition-all border-t-2 border-l border-r ${activeSubTab === 'machines'
                        ? 'bg-emerald-600 text-white border-t-emerald-400 border-l-emerald-300 border-r-emerald-300'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 border-b border-b-emerald-300'
                        }`}
                >
                    Danh sách PTTT không sử dụng máy
                </button>
                <button
                    onClick={() => setActiveSubTab('staff')}
                    className={`flex-1 py-4 text-sm font-bold text-center transition-all border-t-2 border-l border-r ${activeSubTab === 'staff'
                        ? 'bg-blue-600 text-white border-t-blue-400 border-l-blue-300 border-r-blue-300'
                        : 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 border-b border-b-blue-300'
                        }`}
                >
                    Danh sách NVYT
                </button>
            </div>

            {/* Content area */}
            <div className={`p-6 flex-1 overflow-y-auto ${activeSubTab === 'norms'
                ? 'bg-gradient-to-b from-indigo-100 via-indigo-50 to-white border-l border-r border-b border-indigo-300 rounded-b-xl'
                : activeSubTab === 'machines'
                    ? 'bg-gradient-to-b from-emerald-100 via-emerald-50 to-white border-l border-r border-b border-emerald-300 rounded-b-xl'
                    : 'bg-gradient-to-b from-blue-100 via-blue-50 to-white border-l border-r border-b border-blue-300 rounded-b-xl'}`}>

                {activeSubTab === 'norms' && (
                    <div className="animate-fade-in">
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full text-sm text-left text-gray-700">
                                <thead className="bg-indigo-900 text-white font-bold uppercase text-xs">
                                    <tr>
                                        <th rowSpan={2} className="px-4 py-3 border-r border-indigo-700 min-w-[150px] align-middle">Loại PTTT</th>
                                        <th colSpan={3} className="px-4 py-2 border-r border-indigo-700 text-center bg-indigo-800">Phụ cấp PTTT (đồng)</th>
                                        <th colSpan={2} className="px-4 py-2 border-indigo-700 text-center bg-indigo-800">Thời gian thực hiện (phút)</th>
                                    </tr>
                                    <tr>
                                        <th className="px-4 py-2 border-r border-indigo-700 w-[120px] text-center border-t border-indigo-700 bg-indigo-800/50">Chính</th>
                                        <th className="px-4 py-2 border-r border-indigo-700 w-[120px] text-center border-t border-indigo-700 bg-indigo-800/50">Phụ</th>
                                        <th className="px-4 py-2 border-r border-indigo-700 w-[120px] text-center border-t border-indigo-700 bg-indigo-800/50">Giúp việc</th>
                                        <th className="px-4 py-2 border-r border-indigo-700 w-[100px] text-center border-t border-indigo-700 bg-indigo-800/50">Tối thiểu</th>
                                        <th className="px-4 py-2 w-[100px] text-center border-t border-indigo-700 bg-indigo-800/50">Tối đa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-indigo-50 border-b border-indigo-100">
                                        <td colSpan={6} className="px-4 py-3 text-indigo-900 uppercase text-sm font-bold tracking-wide">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                                                Phẫu thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {SURGERY_TYPES.map((type, idx) => (
                                        <tr key={type} className={`border-b transition-all duration-200 cursor-pointer group hover:bg-indigo-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                            <td className="px-4 py-2.5 font-medium border-r pl-8">
                                                <span className="text-gray-700">{type === 'PĐB' ? 'Loại Đặc biệt' : type.replace("P", "Loại ")}</span>
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Chính')}
                                                    onChange={(val) => handlePriceChange(type, 'Chính', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Phụ')}
                                                    onChange={(val) => handlePriceChange(type, 'Phụ', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Giúp việc')}
                                                    onChange={(val) => handlePriceChange(type, 'Giúp việc', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'min')}
                                                    onChange={(val) => handleTimeChange(type, 'min', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'max')}
                                                    onChange={(val) => handleTimeChange(type, 'max', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-teal-50 border-b border-teal-100">
                                        <td colSpan={6} className="px-4 py-3 text-teal-900 uppercase text-sm font-bold tracking-wide">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-teal-400 rounded-full"></span>
                                                Thủ thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {PROCEDURE_TYPES.map((type, idx) => (
                                        <tr key={type} className={`border-b transition-all duration-200 cursor-pointer group hover:bg-teal-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                            <td className="px-4 py-2.5 font-medium border-r pl-8">
                                                <span className="text-gray-700">
                                                    {type === 'TĐB' ? 'Loại Đặc biệt' : type === 'TKPL' ? 'Không phân loại' : type.replace("T", "Loại ")}
                                                </span>
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Chính')}
                                                    onChange={(val) => handlePriceChange(type, 'Chính', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Phụ')}
                                                    onChange={(val) => handlePriceChange(type, 'Phụ', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Giúp việc')}
                                                    onChange={(val) => handlePriceChange(type, 'Giúp việc', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'min')}
                                                    onChange={(val) => handleTimeChange(type, 'min', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                            <td className="p-1.5 bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'max')}
                                                    onChange={(val) => handleTimeChange(type, 'max', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 rounded-md bg-white outline-none transition-all shadow-sm"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t bg-blue-50 mt-6 rounded-lg border-blue-100">
                            <h3 className="font-bold text-lg text-indigo-900 mb-2">Định mức bàn mổ</h3>
                            <div className="overflow-x-auto border border-indigo-200 rounded-lg shadow-sm bg-white">
                                <table className="w-full text-sm">
                                    <thead className="bg-indigo-100 text-indigo-900 font-bold text-left">
                                        <tr>
                                            <th className="px-4 py-3 border-r border-indigo-200">Đối tượng</th>
                                            <th className="px-4 py-3 text-center">Tùy chọn kiểm tra trùng giờ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-indigo-100">
                                        {[
                                            { label: "Bác sĩ phẫu thuật (PT chính, PT phụ)", key: "surgeons" as const },
                                            { label: "Bác sĩ gây mê hồi sức", key: "anesthesiologists" as const },
                                            { label: "KTV gây mê, Tít dụng cụ, giúp việc", key: "support" as const }
                                        ].map((row, idx) => (
                                            <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/30'}>
                                                <td className="px-4 py-3 border-r border-indigo-100 font-medium text-gray-700">{row.label}</td>
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
                                                        className="border-gray-300 rounded-md shadow-sm text-sm p-1"
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

                        <div className="max-w-2xl">
                            <h4 className="font-bold text-gray-900 mb-3">Danh sách tên PTTT bỏ qua kiểm tra máy</h4>
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newMachineName}
                                    onChange={(e) => setNewMachineName(e.target.value)}
                                    placeholder="Nhập tên PTTT..."
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddMachineName()}
                                />
                                <button
                                    onClick={handleAddMachineName}
                                    disabled={!newMachineName.trim()}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
                                >
                                    <Plus className="h-4 w-4 inline mr-1" /> Thêm
                                </button>
                            </div>

                            <div className="bg-white rounded-lg p-2 max-h-[400px] overflow-y-auto border border-emerald-200">
                                {config.ignoredMachineNames.map((name, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded mb-2 border hover:bg-emerald-50">
                                        <div className="flex items-center gap-3">
                                            <span className="w-8 h-8 flex items-center justify-center bg-emerald-600 text-white rounded-full text-xs font-bold">{idx + 1}</span>
                                            <span className="text-sm text-gray-700 font-medium">{name}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newNames = config.ignoredMachineNames.filter(n => n !== name);
                                                updateConfig({ ignoredMachineNames: newNames });
                                            }}
                                            className="text-red-400 hover:text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeSubTab === 'staff' && (
                    <div className="space-y-8 animate-fade-in pb-20">
                        {/* Section 1: Departments */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">Section 0</span>
                                <h3 className="font-bold text-lg text-blue-900">Tên Bệnh viện</h3>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6 mb-8">
                                <div className="flex gap-4 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Tên Bệnh viện hiển thị trên báo cáo</label>
                                        <input
                                            type="text"
                                            value={config.hospitalName || ""}
                                            onChange={(e) => updateConfig({ hospitalName: e.target.value })}
                                            placeholder="Nhập tên bệnh viện..."
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                    <div className="bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-100 flex items-center gap-2 text-blue-700 h-[46px]">
                                        <Save className="h-4 w-4" />
                                        <span className="text-xs font-medium italic">Tự động lưu khi thay đổi</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-4">
                                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">Section 1</span>
                                <h3 className="font-bold text-lg text-blue-900">Danh sách khoa phòng</h3>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6">
                                <div className="flex gap-2 mb-6">
                                    <input
                                        type="text"
                                        value={newDeptName}
                                        onChange={(e) => setNewDeptName(e.target.value)}
                                        placeholder="Nhập tên khoa, phòng cần bổ sung..."
                                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
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
                                        className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        <Plus className="h-5 w-5 inline mr-1" /> Thêm khoa phòng
                                    </button>
                                </div>

                                <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
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
                        </div>

                        {/* Section 2: Medical Staff List */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">Section 2</span>
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
                                                className="px-8 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-all shadow-md"
                                            >
                                                <Edit3 className="h-5 w-5 inline mr-1" /> Cập nhật nhân viên
                                            </button>
                                            <button
                                                onClick={handleNextStaff}
                                                className="px-6 py-2 bg-blue-100 text-blue-700 font-bold rounded-lg hover:bg-blue-200 transition-all border border-blue-200"
                                                title="Chuyển đến nhân viên tiếp theo"
                                            >
                                                <ChevronRight className="h-5 w-5 inline mr-1" /> Kế tiếp
                                            </button>
                                            <button
                                                onClick={resetStaffForm}
                                                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-bold text-gray-600 transition-all"
                                            >
                                                <XCircle className="h-5 w-5 inline mr-1" /> Hủy bỏ
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={handleSaveStaff}
                                            disabled={!staffForm.name.trim()}
                                            className="px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md"
                                        >
                                            <UserPlus className="h-5 w-5 inline mr-1" /> Thêm nhân viên
                                        </button>
                                    )}
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
                                        {(config.staffList || []).length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic">
                                                    Chưa có nhân viên nào trong danh sách. Hãy thêm mới hoặc import từ file Excel.
                                                </td>
                                            </tr>
                                        ) : (
                                            (config.staffList || []).map((staff, idx) => (
                                                <tr
                                                    key={staff.id}
                                                    onClick={() => handleEditStaff(staff)}
                                                    className={`cursor-pointer transition-all ${editingStaffId === staff.id ? 'bg-orange-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}
                                                >
                                                    <td className="px-4 py-3 text-center font-bold text-gray-400 border-r">{idx + 1}</td>
                                                    <td className="px-4 py-3 font-bold text-gray-800 border-r">{staff.name}</td>
                                                    <td className="px-4 py-3 text-center border-r">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${staff.position === 'BS PT' ? 'bg-indigo-100 text-indigo-700' : staff.position === 'BS GMHS' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
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
                                            ))
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
