// ─── Staff List Config ──────────────────────────────────────────────────────────
// Subtab: Hành chính > Nhân viên y tế
// Extracted from ConfigurationTab.tsx lines 2319-2672

import React, { useState, useMemo } from 'react';
import { Users, Download, Upload, Plus, Save, ChevronRight, ChevronLeft, XCircle, Search, Trash2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { StaffMember } from '../../types';

interface StaffListConfigProps {
    onConfigUpdate?: () => void;
}

export const StaffListConfig: React.FC<StaffListConfigProps> = ({ onConfigUpdate }) => {
    const { config, updateConfig } = useConfig();
    const { can, isAdmin } = useAuth();
    const isLocked = !isAdmin && !can('manage_staff');
    const staffList = config.staffList || [];

    const [staffForm, setStaffForm] = useState<Omit<StaffMember, 'id'>>({
        name: "", position: '', taxId: "", department: ""
    });
    const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [staffFilterPosition, setStaffFilterPosition] = useState("");
    const [staffFilterDepartment, setStaffFilterDepartment] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const availableStaffPositions = useMemo(() => {
        const standard = ['BS PT', 'BS GMHS', 'Phụ'];
        const fromList = staffList.map(s => s.position).filter(Boolean) as string[];
        return Array.from(new Set([...standard, ...fromList]));
    }, [staffList]);

    const availableStaffDepartments = useMemo(() => {
        const fromConfig = config.departments || [];
        const fromList = staffList.map(s => s.department).filter(Boolean) as string[];
        return Array.from(new Set([...fromConfig, ...fromList])).sort();
    }, [config.departments, staffList]);

    const getFilteredStaff = () => {
        return staffList.filter(s => {
            if (staffFilterPosition && s.position !== staffFilterPosition) return false;
            if (staffFilterDepartment && s.department !== staffFilterDepartment) return false;
            if (searchQuery.trim()) {
                const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                const combinedText = `${s.name || ''} ${s.position || ''} ${s.taxId || ''} ${s.department || ''}`.toLowerCase();
                let lastIdx = -1;
                for (const word of words) {
                    const idx = combinedText.indexOf(word, lastIdx + 1);
                    if (idx === -1) return false;
                    lastIdx = idx;
                }
            }
            return true;
        });
    };

    const filteredStaffList = getFilteredStaff();
    const totalPages = Math.ceil(filteredStaffList.length / pageSize);
    const paginatedStaff = filteredStaffList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const internalSaveStaff = (currentStaffForm: Omit<StaffMember, 'id'>, currentEditingId: string | null) => {
        if (!currentStaffForm.name.trim()) return null;
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

    const resetStaffForm = () => {
        setStaffForm({ name: "", position: '', taxId: "", department: "" });
        setEditingStaffId(null);
    };

    const handleSaveStaff = () => {
        if (internalSaveStaff(staffForm, editingStaffId)) resetStaffForm();
    };

    const handleEditStaff = (staff: StaffMember) => {
        setStaffForm({ name: staff.name, position: staff.position, taxId: staff.taxId, department: staff.department });
        setEditingStaffId(staff.id);
    };

    const handleNextStaff = () => {
        if (staffList.length === 0) return;
        let currentList = staffList;
        let currentId = editingStaffId;
        if (editingStaffId) {
            const saveResult = internalSaveStaff(staffForm, editingStaffId);
            if (saveResult) {
                currentList = saveResult.newList;
                currentId = saveResult.newId;
            }
        }
        const currentFiltered = currentList.filter(s => {
            if (staffFilterPosition && s.position !== staffFilterPosition) return false;
            if (staffFilterDepartment && s.department !== staffFilterDepartment) return false;
            if (searchQuery.trim()) {
                const combinedText = `${s.name || ''} ${s.position || ''} ${s.taxId || ''} ${s.department || ''}`.toLowerCase();
                const words = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                let lastIdx = -1;
                for (const word of words) {
                    const idx = combinedText.indexOf(word, lastIdx + 1);
                    if (idx === -1) return false;
                    lastIdx = idx;
                }
            }
            return true;
        });
        let nextIdx = 0;
        if (currentId) {
            const currentIdx = currentFiltered.findIndex(s => s.id === currentId);
            nextIdx = (currentIdx !== -1 && currentIdx < currentFiltered.length - 1) ? currentIdx + 1 : 0;
        }
        if (currentFiltered.length > 0) handleEditStaff(currentFiltered[nextIdx]);
    };

    const handleDeleteStaff = (id: string) => {
        if (confirm("Bạn có chắc chắn muốn xóa nhân viên này?")) {
            updateConfig({ staffList: staffList.filter(s => s.id !== id) });
        }
    };

    const handleExportExcel = () => {
        const headers = ["Họ tên", "Vị trí", "Khoa", "Mã số thuế TNCN"];
        let data: any[][] = [headers];
        if (staffList.length > 0) staffList.forEach(s => data.push([s.name, s.position, s.department, s.taxId]));
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
                const headers = jsonData[0].map(h => String(h || "").trim());
                const nameIdx = headers.indexOf("Họ tên");
                const posIdx = headers.indexOf("Vị trí");
                const deptIdx = headers.indexOf("Khoa");
                const taxIdx = headers.indexOf("Mã số thuế TNCN");
                if (nameIdx !== -1 && posIdx !== -1 && deptIdx !== -1) {
                    validSheetsFound++;
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row) continue;
                        const name = row[nameIdx] ? String(row[nameIdx]).trim() : "";
                        if (!name) continue;
                        const posRaw = row[posIdx] ? String(row[posIdx]).trim() : "";
                        const dept = row[deptIdx] ? String(row[deptIdx]).trim() : "";
                        const tax = taxIdx !== -1 && row[taxIdx] ? String(row[taxIdx]).trim() : "";
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
        e.target.value = "";
    };

    return (
        <div className="space-y-4 p-1">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Users className="h-4 w-4" /></div>
                    <div>
                        <h4 className="font-semibold text-gray-800 text-sm">Danh sách nhân viên y tế</h4>
                        <p className="text-[11px] text-gray-400">Quản lý nhân sự phẫu thuật, gây mê và phụ tá ({staffList.length} nhân sự)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all shadow-sm">
                        <Download className="h-3.5 w-3.5 text-gray-500" /> Xuất Excel
                    </button>
                    {isLocked ? (
                        <button disabled title="Cấu hình đang khóa (Chỉ xem)" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed shadow-none">
                            <Upload className="h-3.5 w-3.5 text-gray-400" /> Import Excel
                        </button>
                    ) : (
                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-all shadow-sm">
                            <Upload className="h-3.5 w-3.5" /> Import Excel
                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
                        </label>
                    )}
                </div>
            </div>

            {/* Add/Edit Form */}
            <div className={`bg-white rounded-xl border border-gray-200 p-3 shadow-sm space-y-2 ${isLocked ? 'pointer-events-none select-none opacity-80' : ''}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span>{editingStaffId ? 'Chỉnh sửa thông tin nhân sự' : 'Thêm nhân sự mới'}</span>
                    {editingStaffId && <span className="text-[11px] font-normal text-amber-600">Đang chọn sửa dòng #{staffList.findIndex(s => s.id === editingStaffId) + 1}</span>}
                </div>
                <div className="flex flex-wrap md:flex-nowrap items-end gap-2.5">
                    <div className="flex-1 min-w-[160px]">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Họ tên nhân viên <span className="text-red-500">*</span></label>
                        <input type="text" value={staffForm.name} disabled={isLocked} readOnly={isLocked} tabIndex={isLocked ? -1 : undefined} onChange={(e) => { if (!isLocked) setStaffForm({ ...staffForm, name: e.target.value }); }} placeholder="Nguyễn Văn A" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none h-[35px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                    </div>
                    <div className="w-32 min-w-[110px]">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Vị trí mổ</label>
                        <select value={staffForm.position} disabled={isLocked} tabIndex={isLocked ? -1 : undefined} onChange={(e) => { if (!isLocked) setStaffForm({ ...staffForm, position: e.target.value as any }); }} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white h-[35px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
                            <option value="">-- Vị trí --</option>
                            <option value="BS PT">BS PT</option>
                            <option value="BS GMHS">BS GMHS</option>
                            <option value="Phụ">Phụ (KTV/DDC/GV)</option>
                        </select>
                    </div>
                    <div className="w-32 min-w-[110px]">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Mã số thuế TNCN</label>
                        <input type="text" value={staffForm.taxId} disabled={isLocked} readOnly={isLocked} tabIndex={isLocked ? -1 : undefined} onChange={(e) => { if (!isLocked) setStaffForm({ ...staffForm, taxId: e.target.value }); }} placeholder="Nhập MST..." className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none h-[35px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                    </div>
                    <div className="w-44 min-w-[130px]">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Khoa / Phòng</label>
                        <select value={staffForm.department} disabled={isLocked} tabIndex={isLocked ? -1 : undefined} onChange={(e) => { if (!isLocked) setStaffForm({ ...staffForm, department: e.target.value }); }} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white h-[35px] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
                            <option value="">-- Khoa phòng --</option>
                            {(config.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {editingStaffId ? (
                            <>
                                <button onClick={handleSaveStaff} disabled={!staffForm.name.trim() || isLocked} className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1 shadow-sm h-[35px] whitespace-nowrap">
                                    <Save className="h-3.5 w-3.5" /> Lưu
                                </button>
                                <button onClick={handleNextStaff} disabled={isLocked} className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed border border-blue-200 rounded-lg transition-all flex items-center gap-1 h-[35px] whitespace-nowrap" title="Lưu và chuyển đến nhân viên tiếp theo">
                                    <ChevronRight className="h-3.5 w-3.5" /> Kế tiếp
                                </button>
                                <button onClick={resetStaffForm} disabled={isLocked} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed rounded-lg transition-colors h-[35px] flex items-center justify-center" title="Hủy bỏ">
                                    <XCircle className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <button onClick={handleSaveStaff} disabled={!staffForm.name.trim() || isLocked} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap h-[35px]">
                                <Plus className="h-3.5 w-3.5" /> Thêm
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} placeholder="Tìm theo tên, vị trí, khoa, MST..." className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white h-[34px]" />
                        {searchQuery && <button type="button" onClick={() => { setSearchQuery(""); setCurrentPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5" title="Xóa tìm kiếm"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    <div className="w-36 min-w-[120px]">
                        <select value={staffFilterPosition} onChange={(e) => { setStaffFilterPosition(e.target.value); setCurrentPage(1); }} className={`w-full px-2.5 py-1.5 border rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white h-[34px] font-medium transition-colors ${staffFilterPosition ? 'border-blue-400 text-blue-700 bg-blue-50/30' : 'border-gray-200 text-gray-700'}`}>
                            <option value="">-- Tất cả vị trí --</option>
                            {availableStaffPositions.map(pos => <option key={pos} value={pos}>{pos === 'Phụ' ? 'Phụ (KTV/DDC/GV)' : pos}</option>)}
                        </select>
                    </div>
                    <div className="w-48 min-w-[140px]">
                        <select value={staffFilterDepartment} onChange={(e) => { setStaffFilterDepartment(e.target.value); setCurrentPage(1); }} className={`w-full px-2.5 py-1.5 border rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none bg-white h-[34px] font-medium transition-colors ${staffFilterDepartment ? 'border-blue-400 text-blue-700 bg-blue-50/30' : 'border-gray-200 text-gray-700'}`}>
                            <option value="">-- Tất cả khoa/phòng --</option>
                            {availableStaffDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                        </select>
                    </div>
                    {(searchQuery || staffFilterPosition || staffFilterDepartment) && (
                        <button type="button" onClick={() => { setSearchQuery(""); setStaffFilterPosition(""); setStaffFilterDepartment(""); setCurrentPage(1); }} className="px-2.5 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border border-dashed border-gray-300 hover:border-red-300 rounded-lg transition-colors flex items-center gap-1 h-[34px] cursor-pointer" title="Xóa tất cả bộ lọc">
                            <X className="h-3 w-3" /><span>Xóa lọc</span>
                        </button>
                    )}
                </div>
                <div className="text-xs text-gray-500 font-medium shrink-0">
                    Hiển thị <span className="font-bold text-gray-800">{filteredStaffList.length}</span>
                    {filteredStaffList.length !== staffList.length && <span> / {staffList.length}</span>} nhân sự
                </div>
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
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic text-sm">
                                {searchQuery || staffFilterPosition || staffFilterDepartment ? "Không tìm thấy nhân viên nào phù hợp với bộ lọc." : "Chưa có nhân viên nào trong danh sách. Hãy thêm mới hoặc import từ file Excel."}
                            </td></tr>
                        ) : (
                            paginatedStaff.map((staff, pIdx) => {
                                const globalIdx = (currentPage - 1) * pageSize + pIdx;
                                return (
                                    <tr key={staff.id} onClick={() => { if (!isLocked) handleEditStaff(staff); }} className={`${isLocked ? 'cursor-default pointer-events-none' : 'cursor-pointer'} transition-colors ${editingStaffId === staff.id ? 'bg-blue-50/70 font-medium' : 'hover:bg-gray-50/70'}`}>
                                        <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-100">{globalIdx + 1}</td>
                                        <td className="px-3 py-2 font-semibold text-gray-800 border-r border-gray-100">{staff.name}</td>
                                        <td className="px-3 py-2 text-center border-r border-gray-100">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${staff.position === 'BS PT' ? 'bg-blue-50 text-blue-700 border-blue-200' : staff.position === 'BS GMHS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                {staff.position || 'Chưa chọn'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 font-mono border-r border-gray-100">{staff.taxId || "—"}</td>
                                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{staff.department || "—"}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button onClick={(e) => { e.stopPropagation(); if (isLocked) return; handleDeleteStaff(staff.id); }} disabled={isLocked} title={isLocked ? "Cấu hình đang khóa (Chỉ xem)" : "Xóa"} className={`p-1 rounded transition-colors ${isLocked ? 'text-gray-300 cursor-not-allowed opacity-40 pointer-events-none' : 'hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer'}`}>
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

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Số dòng:</span>
                        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="px-2 py-0.5 border border-gray-200 rounded text-xs font-semibold bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                            {[10, 20, 30, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                    </div>
                    <span>Đang xem {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredStaffList.length)} trong tổng số {filteredStaffList.length} nhân viên</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span className="text-xs font-semibold px-1.5 min-w-[70px] text-center">{currentPage} / {Math.max(1, totalPages)}</span>
                    <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
            </div>
        </div>
    );
};
