// ─── Department Config ─────────────────────────────────────────────────────────
// Subtab: Hành chính > DM Khoa, phòng
// Extracted from ConfigurationTab.tsx lines 1855-2318

import React, { useState } from 'react';
import { Layers, Plus, ArrowUp, ArrowDown, Pencil, Check, X, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';

export const DepartmentConfig: React.FC = () => {
    const { config, updateConfig, isLocked } = useConfig();
    const [newDeptShortName, setNewDeptShortName] = useState("");
    const [newDeptFullName, setNewDeptFullName] = useState("");
    const [editingDeptIndex, setEditingDeptIndex] = useState<number | null>(null);
    const [editDeptShortName, setEditDeptShortName] = useState("");
    const [editDeptFullName, setEditDeptFullName] = useState("");

    const departments = config.departments || [];
    const departmentDetails = config.departmentDetails || {};

    const handleAddDept = () => {
        if (isLocked) return;
        const short = newDeptShortName.trim();
        if (!short) return;
        if (departments.includes(short)) {
            alert(`Khoa phòng "${short}" đã tồn tại!`);
            return;
        }
        const newDepts = [...departments, short];
        const newDetails = { ...departmentDetails };
        if (newDeptFullName.trim()) {
            newDetails[short] = { fullName: newDeptFullName.trim() };
        }
        updateConfig({ departments: newDepts, departmentDetails: newDetails });
        setNewDeptShortName("");
        setNewDeptFullName("");
    };

    const handleSaveEdit = () => {
        if (editingDeptIndex === null) return;
        const dept = departments[editingDeptIndex];
        const newShort = editDeptShortName.trim();
        if (!newShort) {
            alert("Tên vắn tắt không được để trống!");
            return;
        }
        const depts = [...departments];
        const newDetails = { ...departmentDetails };
        if (newShort !== dept) {
            if (depts.some((d, i) => i !== editingDeptIndex && d.toLowerCase() === newShort.toLowerCase())) {
                alert(`Khoa phòng "${newShort}" đã tồn tại!`);
                return;
            }
            depts[editingDeptIndex] = newShort;
            delete newDetails[dept];
            newDetails[newShort] = { fullName: editDeptFullName.trim() };
            const updatedStaff = (config.staffList || []).map(s => s.department === dept ? { ...s, department: newShort } : s);
            updateConfig({ departments: depts, departmentDetails: newDetails, staffList: updatedStaff });
        } else {
            newDetails[dept] = { fullName: editDeptFullName.trim() };
            updateConfig({ departmentDetails: newDetails });
        }
        setEditingDeptIndex(null);
    };

    const handleStartEdit = (idx: number) => {
        if (isLocked) return;
        const dept = departments[idx];
        setEditingDeptIndex(idx);
        setEditDeptShortName(dept);
        setEditDeptFullName(departmentDetails[dept]?.fullName || '');
    };

    const handleMoveDept = (idx: number, direction: 'up' | 'down') => {
        if (isLocked) return;
        const depts = [...departments];
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= depts.length) return;
        [depts[idx], depts[target]] = [depts[target], depts[idx]];
        updateConfig({ departments: depts });
    };

    const handleDeleteDept = (dept: string) => {
        if (isLocked) return;
        if (!confirm(`Xóa khoa phòng "${dept}"? Nhân viên thuộc khoa này sẽ KHÔNG bị xóa nhưng cột khoa sẽ trống.`)) return;
        const newDepts = departments.filter(d => d !== dept);
        const newDetails = { ...departmentDetails };
        delete newDetails[dept];
        updateConfig({ departments: newDepts, departmentDetails: newDetails });
    };

    const handleToggleInclude = (dept: string) => {
        if (isLocked) return;
        const detail = departmentDetails[dept];
        const isIncluded = detail?.includeInReport ?? true;
        const newDetails = { ...departmentDetails };
        newDetails[dept] = { ...detail, fullName: detail?.fullName || '', includeInReport: !isIncluded };
        updateConfig({ departmentDetails: newDetails });
    };

    return (
        <div className="space-y-4 p-1">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                        <Layers className="h-4 w-4" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-800 text-sm">Danh mục Khoa, phòng</h4>
                        <p className="text-[11px] text-gray-400">Quản lý danh sách các khoa/phòng trong bệnh viện ({departments.length} đơn vị)</p>
                    </div>
                </div>
            </div>

            {/* Add Form */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white rounded-xl border border-gray-200 p-2.5 shadow-xs">
                <input
                    type="text"
                    value={newDeptShortName}
                    disabled={isLocked}
                    onChange={(e) => setNewDeptShortName(e.target.value)}
                    placeholder="Tên vắn tắt (VD: GMHS)..."
                    className="w-full sm:w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDept()}
                />
                <input
                    type="text"
                    value={newDeptFullName}
                    disabled={isLocked}
                    onChange={(e) => setNewDeptFullName(e.target.value)}
                    placeholder="Tên đầy đủ (VD: Phẫu thuật - Gây mê hồi sức)..."
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDept()}
                />
                <button
                    onClick={handleAddDept}
                    disabled={!newDeptShortName.trim() || isLocked}
                    title={isLocked ? "Cấu hình đang bị khóa" : "Thêm khoa phòng"}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs transition-all flex items-center justify-center gap-1 shadow-xs whitespace-nowrap cursor-pointer shrink-0"
                >
                    <Plus className="h-3.5 w-3.5" /> Thêm
                </button>
            </div>

            {/* Departments Table */}
            <div className="overflow-hidden border border-gray-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-3 py-2.5 w-12 text-center text-gray-500 font-semibold border-r border-gray-100">STT</th>
                            <th className="px-3 py-2.5 w-44 text-gray-600 font-semibold">Tên vắn tắt</th>
                            <th className="px-3 py-2.5 text-gray-600 font-semibold">Tên đầy đủ</th>
                            <th className="px-3 py-2.5 w-32 text-center text-gray-600 font-semibold">Lấy vào báo cáo</th>
                            <th className="px-3 py-2.5 w-20 text-center text-gray-500 font-semibold">Thứ tự</th>
                            <th className="px-3 py-2.5 w-24 text-center text-gray-500 font-semibold">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {departments.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 italic text-sm">
                                    Chưa có khoa phòng nào trong danh sách.
                                </td>
                            </tr>
                        ) : (
                            departments.map((dept, idx) => {
                                const isEditing = editingDeptIndex === idx;
                                const deptDetail = departmentDetails[dept];
                                const currentFullName = deptDetail?.fullName || '';
                                const isIncluded = deptDetail?.includeInReport ?? true;

                                if (isEditing) {
                                    return (
                                        <tr key={dept} className="bg-blue-50/50 ring-1 ring-blue-300 transition-colors">
                                            <td className="px-3 py-2 text-center font-medium text-gray-400 border-r border-gray-100">{idx + 1}</td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="text"
                                                    value={editDeptShortName}
                                                    onChange={(e) => setEditDeptShortName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit();
                                                        else if (e.key === 'Escape') setEditingDeptIndex(null);
                                                    }}
                                                    className="w-full px-2 py-1 text-xs font-bold text-gray-900 bg-white border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                    placeholder="Tên vắn tắt..."
                                                    autoFocus
                                                />
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <input
                                                    type="text"
                                                    value={editDeptFullName}
                                                    onChange={(e) => setEditDeptFullName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveEdit();
                                                        else if (e.key === 'Escape') setEditingDeptIndex(null);
                                                    }}
                                                    className="w-full px-2 py-1 text-xs text-gray-800 bg-white border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                    placeholder="Tên đầy đủ (VD: Phẫu thuật - Gây mê hồi sức)..."
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center text-gray-300">—</td>
                                            <td className="px-3 py-2 text-center text-gray-300">—</td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button type="button" onClick={handleSaveEdit} title="Lưu (Enter)" className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors cursor-pointer">
                                                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                                    </button>
                                                    <button type="button" onClick={() => setEditingDeptIndex(null)} title="Hủy (Esc)" className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors cursor-pointer">
                                                        <X className="h-3.5 w-3.5 stroke-[2.5]" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={dept} className="hover:bg-gray-50/70 transition-colors">
                                        <td className="px-3 py-2.5 text-center font-medium text-gray-400 border-r border-gray-100">{idx + 1}</td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-bold text-gray-900 bg-gray-100/80 px-2 py-0.5 rounded border border-gray-200 font-mono text-[11px]">
                                                {dept}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {currentFullName ? (
                                                <span className="font-medium text-gray-800">{currentFullName}</span>
                                            ) : (
                                                <span className="italic text-gray-400 text-[11px]">(Chưa có tên đầy đủ)</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                type="button"
                                                disabled={isLocked}
                                                onClick={() => handleToggleInclude(dept)}
                                                title={isLocked ? 'Cấu hình đang khóa' : isIncluded ? 'Đang lấy vào báo cáo — bấm để tắt' : 'Đã tắt — bấm để bật'}
                                                className={isLocked ? 'cursor-not-allowed opacity-40 pointer-events-none' : 'cursor-pointer'}
                                            >
                                                {isIncluded ? <ToggleRight className="h-5 w-5 text-green-500 mx-auto" /> : <ToggleLeft className="h-5 w-5 text-gray-300 mx-auto" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center justify-center gap-0.5">
                                                <button disabled={idx === 0 || isLocked} onClick={() => handleMoveDept(idx, 'up')} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer">
                                                    <ArrowUp className="h-3 w-3" />
                                                </button>
                                                <button disabled={idx === departments.length - 1 || isLocked} onClick={() => handleMoveDept(idx, 'down')} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer">
                                                    <ArrowDown className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button disabled={isLocked} onClick={() => handleStartEdit(idx)} title={isLocked ? 'Cấu hình đang khóa' : 'Sửa'} className={`p-1 rounded transition-colors ${isLocked ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-blue-50 text-blue-400 hover:text-blue-600 cursor-pointer'}`}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button disabled={isLocked} onClick={() => handleDeleteDept(dept)} title={isLocked ? 'Cấu hình đang khóa' : 'Xóa'} className={`p-1 rounded transition-colors ${isLocked ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-red-100 text-red-400 hover:text-red-600 cursor-pointer'}`}>
                                                    <Trash2 className="h-3.5 w-3.5" />
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
    );
};
