// ─── Machine Registry Config ──────────────────────────────────────────────────
// Subtab: DMKT > DM Mã máy (Registry)
// Extracted from ConfigurationTab.tsx lines 1098-1328

import React, { useState, useMemo } from 'react';
import { Download, Upload, RefreshCw, Plus, Save, XCircle, Check, AlertCircle, Search, Trash2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig } from '../../contexts/ConfigContext';
import { MachineEntry } from '../../types';
import { reportService } from '../../services/reportService';

interface MachineRegistryConfigProps {
    onConfigUpdate?: () => void;
}

type ImportDialogData = {
    allParsed: MachineEntry[];
    duplicatesInFile: { rowNum: number; entry: MachineEntry; firstRowNum: number }[];
    cleanEntries: MachineEntry[];
};

export const MachineRegistryConfig: React.FC<MachineRegistryConfigProps> = ({ onConfigUpdate }) => {
    const { config, updateConfig, isLocked } = useConfig();
    const registry = config.machineRegistry || [];

    const [regSearchQuery, setRegSearchQuery] = useState("");
    const [regCurrentPage, setRegCurrentPage] = useState(1);
    const [regPageSize, setRegPageSize] = useState(20);
    const [regForm, setRegForm] = useState<Omit<MachineEntry, 'id'>>({ machineId: "", machineCode: "", machineName: "", active: true });
    const [editingRegId, setEditingRegId] = useState<string | null>(null);
    const [importDialog, setImportDialog] = useState<ImportDialogData | null>(null);
    const [backfillRunning, setBackfillRunning] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState<string>('');
    const [backfillResult, setBackfillResult] = useState<{ totalScanned: number; matched: number; alreadyFilled: number; noMachine: number; unmatched: number; updated: number; unmatchedNames: { name: string; count: number }[] } | null>(null);

    const filteredRegistry = useMemo(() => {
        if (!regSearchQuery.trim()) return registry;
        const q = regSearchQuery.toLowerCase().trim();
        return registry.filter(m => m.machineId.toLowerCase().includes(q) || m.machineCode.toLowerCase().includes(q) || m.machineName.toLowerCase().includes(q));
    }, [registry, regSearchQuery]);

    const totalRegPages = Math.ceil(filteredRegistry.length / regPageSize);
    const paginatedRegistry = filteredRegistry.slice((regCurrentPage - 1) * regPageSize, regCurrentPage * regPageSize);

    const handleAddRegistry = () => {
        if (!regForm.machineCode.trim()) return;
        if (registry.some(m => m.machineCode === regForm.machineCode.trim())) {
            alert(`Mã máy "${regForm.machineCode.trim()}" đã tồn tại.`);
            return;
        }
        const newEntry: MachineEntry = { id: `reg_${Date.now()}`, machineId: regForm.machineId.trim(), machineCode: regForm.machineCode.trim(), machineName: regForm.machineName.trim(), active: regForm.active };
        updateConfig({ machineRegistry: [...registry, newEntry] });
        setRegForm({ machineId: "", machineCode: "", machineName: "", active: true });
        onConfigUpdate?.();
    };

    const handleEditRegistry = (entry: MachineEntry) => {
        setEditingRegId(entry.id);
        setRegForm({ machineId: entry.machineId, machineCode: entry.machineCode, machineName: entry.machineName, active: entry.active });
    };

    const handleSaveRegistry = () => {
        if (!editingRegId || !regForm.machineCode.trim()) return;
        if (registry.some(m => m.machineCode === regForm.machineCode.trim() && m.id !== editingRegId)) {
            alert(`Mã máy "${regForm.machineCode.trim()}" đã tồn tại.`);
            return;
        }
        const newList = registry.map(m => m.id === editingRegId ? { ...m, machineId: regForm.machineId.trim(), machineCode: regForm.machineCode.trim(), machineName: regForm.machineName.trim(), active: regForm.active } : m);
        updateConfig({ machineRegistry: newList });
        setEditingRegId(null);
        setRegForm({ machineId: "", machineCode: "", machineName: "", active: true });
        onConfigUpdate?.();
    };

    const handleDeleteRegistry = (id: string) => {
        if (!window.confirm("Bạn chắc chắn muốn xóa mã máy này?")) return;
        updateConfig({ machineRegistry: registry.filter(m => m.id !== id) });
        onConfigUpdate?.();
    };

    const handleToggleActive = (id: string) => {
        updateConfig({ machineRegistry: registry.map(m => m.id === id ? { ...m, active: !m.active } : m) });
        onConfigUpdate?.();
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
                        _rowNum: i + 1,
                    } as MachineEntry & { _rowNum: number });
                }
            });
            if (allParsed.length === 0) {
                alert("Không tìm thấy dữ liệu hợp lệ trong file. Vui lòng kiểm tra cấu trúc cột.");
                e.target.value = "";
                return;
            }
            const seenMap = new Map<string, { entry: MachineEntry; rowNum: number }>();
            const duplicatesInFile: { rowNum: number; entry: MachineEntry; firstRowNum: number }[] = [];
            const cleanEntries: MachineEntry[] = [];
            allParsed.forEach((entry) => {
                const rowNum = (entry as any)._rowNum as number;
                const existing = seenMap.get(entry.machineCode);
                if (existing) {
                    duplicatesInFile.push({ rowNum, entry, firstRowNum: existing.rowNum });
                } else {
                    seenMap.set(entry.machineCode, { entry, rowNum });
                    cleanEntries.push(entry);
                }
            });
            setImportDialog({ allParsed, duplicatesInFile, cleanEntries });
            e.target.value = "";
        };
        reader.readAsArrayBuffer(file);
    };

    const handleConfirmImport = (mode: 'overwrite_clean' | 'cancel') => {
        if (mode === 'cancel' || !importDialog) { setImportDialog(null); return; }
        const newRegistry = importDialog.cleanEntries.map(e => { const { _rowNum, ...clean } = e as any; return clean as MachineEntry; });
        updateConfig({ machineRegistry: newRegistry });
        onConfigUpdate?.();
        alert(`Đã import ${newRegistry.length} mã máy (ghi đè toàn bộ dữ liệu cũ).${importDialog.duplicatesInFile.length > 0 ? ` Đã loại ${importDialog.duplicatesInFile.length} dòng trùng.` : ''}`);
        setImportDialog(null);
    };

    const handleBackfill = async () => {
        if (registry.length === 0) { alert('Chưa có dữ liệu mã máy trong bảng đăng ký. Hãy import trước.'); return; }
        if (!window.confirm(`Bạn có chắc chắn muốn backfill mã máy và ID máy cho toàn bộ dữ liệu lưu trữ?\n\nHệ thống sẽ quét tất cả bản ghi trên Firestore, so khớp trường "Tên máy" với ${registry.length} mã máy trong bảng đăng ký, rồi cập nhật trường machineCode và machineId.\n\nThao tác này không xóa dữ liệu, chỉ bổ sung thông tin còn thiếu.`)) return;
        setBackfillRunning(true);
        setBackfillProgress('Đang khởi tạo...');
        setBackfillResult(null);
        try {
            const result = await reportService.backfillMachineRegistry(registry, (msg) => setBackfillProgress(msg));
            setBackfillResult(result);
            setBackfillProgress('Hoàn thành!');
        } catch (err: any) {
            setBackfillProgress(`Lỗi: ${err.message}`);
        } finally {
            setBackfillRunning(false);
        }
    };

    return (
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

            {/* Header + Actions */}
            <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-800 text-sm">Danh sách máy ({registry.length} máy, {registry.filter(m => m.active).length} đang sử dụng)</h4>
                <div className="flex gap-2">
                    <button onClick={handleExportRegistry} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                        <Download className="h-3.5 w-3.5" /> Xuất Excel
                    </button>
                    <button onClick={handleBackfill} disabled={backfillRunning || registry.length === 0 || isLocked} title="Backfill: Bổ sung mã máy & ID máy cho các bản ghi cũ dựa vào tên máy đã nhập trong dữ liệu phẫu thuật" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${backfillRunning || registry.length === 0 || isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        <RefreshCw className={`h-3.5 w-3.5 ${backfillRunning ? 'animate-spin' : ''}`} />
                        {backfillRunning ? 'Đang backfill...' : 'Backfill'}
                    </button>
                    {isLocked ? (
                        <button disabled title="Cấu hình đang khóa (Chỉ xem)" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 rounded-lg cursor-not-allowed shadow-none">
                            <Upload className="h-3.5 w-3.5 text-gray-400" /> Import Excel
                        </button>
                    ) : (
                        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-all shadow-sm">
                            <Upload className="h-3.5 w-3.5" /> Import Excel
                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportRegistry} />
                        </label>
                    )}
                </div>
            </div>

            {/* Backfill progress/result */}
            {backfillProgress && <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700 font-medium">{backfillProgress}</div>}
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

            {/* Add/Edit Form */}
            <div className={`flex items-end gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 ${isLocked ? 'pointer-events-none select-none opacity-80' : ''}`}>
                <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">ID máy</label>
                    <input type="text" value={regForm.machineId} disabled={isLocked} onChange={(e) => { if (!isLocked) setRegForm({ ...regForm, machineId: e.target.value }); }} placeholder="M001" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                </div>
                <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Mã máy <span className="text-red-500">*</span></label>
                    <input type="text" value={regForm.machineCode} disabled={isLocked} onChange={(e) => { if (!isLocked) setRegForm({ ...regForm, machineCode: e.target.value }); }} placeholder="NS-001" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                </div>
                <div className="flex-[2] min-w-0">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">Tên máy</label>
                    <input type="text" value={regForm.machineName} disabled={isLocked} onChange={(e) => { if (!isLocked) setRegForm({ ...regForm, machineName: e.target.value }); }} placeholder="Nội soi Karl Storz" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                </div>
                {editingRegId ? (
                    <>
                        <button onClick={handleSaveRegistry} disabled={isLocked} className="px-3 py-1 bg-orange-500 text-white font-semibold rounded text-xs hover:bg-orange-600 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed transition-all flex items-center gap-1 whitespace-nowrap"><Save className="h-3.5 w-3.5" /> Lưu</button>
                        <button onClick={() => { if (isLocked) return; setEditingRegId(null); setRegForm({ machineId: "", machineCode: "", machineName: "", active: true }); }} disabled={isLocked} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed rounded transition-colors" title="Hủy"><XCircle className="h-4 w-4" /></button>
                    </>
                ) : (
                    <button onClick={handleAddRegistry} disabled={!regForm.machineCode.trim() || isLocked} className="px-3 py-1 bg-blue-600 text-white font-semibold rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed transition-all flex items-center gap-1 whitespace-nowrap"><Plus className="h-3.5 w-3.5" /> Thêm</button>
                )}
            </div>

            {/* Search bar */}
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={regSearchQuery} onChange={(e) => { setRegSearchQuery(e.target.value); setRegCurrentPage(1); }} placeholder="Tìm ID, mã hoặc tên máy..." className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
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
                                    <tr key={entry.id} onClick={() => { if (!isLocked) handleEditRegistry(entry); }} className={`${isLocked ? 'cursor-default' : 'cursor-pointer'} transition-colors ${editingRegId === entry.id ? 'bg-blue-50' : 'hover:bg-gray-50'} ${!entry.active ? 'opacity-50' : ''}`}>
                                        <td className="px-3 py-2 text-center text-gray-400">{globalIdx + 1}</td>
                                        <td className="px-3 py-2 font-mono text-gray-600 text-xs">{entry.machineId || '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-blue-700">{entry.machineCode}</td>
                                        <td className="px-3 py-2 text-gray-800">{entry.machineName || '—'}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button disabled={isLocked} onClick={(e) => { e.stopPropagation(); if (!isLocked) handleToggleActive(entry.id); }} title={isLocked ? 'Cấu hình đang khóa (Chỉ xem)' : entry.active ? 'Đang sử dụng — bấm để tắt' : 'Đã tắt — bấm để bật'} className={isLocked ? 'cursor-not-allowed opacity-40 pointer-events-none' : 'cursor-pointer'}>
                                                {entry.active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button disabled={isLocked} onClick={(e) => { e.stopPropagation(); if (!isLocked) handleDeleteRegistry(entry.id); }} title={isLocked ? 'Cấu hình đang khóa (Chỉ xem)' : 'Xóa'} className={`p-1 rounded transition-colors ${isLocked ? 'text-gray-300 cursor-not-allowed opacity-40 pointer-events-none' : 'hover:bg-red-100 text-red-400 hover:text-red-600 cursor-pointer'}`}>
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
    );
};
