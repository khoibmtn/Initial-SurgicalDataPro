import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Plus, Trash2, Search } from 'lucide-react';
import { useConfig, AppConfig, RolePrice, TimeRule } from '../contexts/ConfigContext';

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
            className={`${className} text-${align}`}
        />
    );
};

export const ConfigurationTab: React.FC = () => {
    const { config, updateConfig, resetConfig, isLoaded } = useConfig();
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'machines'>('norms');
    const [newMachineName, setNewMachineName] = useState("");

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
    const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"]; // Fixed typo TKKPL -> TKPL if needed, check default config keys. 
    // In ConfigContext default keys are TKPL.

    const getPrice = (loai: string, role: keyof RolePrice) => config.priceConfig[loai]?.[role] ?? 0;
    const getTime = (loai: string, field: 'min' | 'max') => config.timeRules[loai]?.[field] ?? 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[600px] flex flex-col font-inter text-sm">

            {/* Tab Navigation */}
            <div className="flex relative">
                <button
                    onClick={() => setActiveSubTab('norms')}
                    className={`flex-1 py-4 text-sm font-bold text-center transition-all border-t-2 border-l border-r ${activeSubTab === 'norms'
                        ? 'bg-indigo-600 text-white border-t-indigo-400 border-l-indigo-300 border-r-indigo-300'
                        : 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200 border-b border-b-indigo-300'
                        }`}
                >
                    Định mức thời gian, phụ cấp PTTT
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
            </div>

            {/* Content area with matching thin border - continuous with active tab */}
            <div className={`p-6 flex-1 overflow-y-auto ${activeSubTab === 'norms'
                ? 'bg-gradient-to-b from-indigo-100 via-indigo-50 to-white border-l border-r border-b border-indigo-300 rounded-b-xl'
                : 'bg-gradient-to-b from-emerald-100 via-emerald-50 to-white border-l border-r border-b border-emerald-300 rounded-b-xl'}`}>
                {activeSubTab === 'norms' && (
                    <div className="animate-fade-in">
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full text-sm text-left text-gray-700">
                                <thead className="bg-gray-50 text-gray-900 font-bold uppercase text-xs">
                                    <tr>
                                        <th rowSpan={2} className="px-4 py-3 border-r border-b border-gray-200 bg-gray-100 min-w-[150px] align-middle">Loại PTTT</th>
                                        <th colSpan={3} className="px-4 py-2 border-r border-b border-gray-200 text-center bg-blue-50 text-blue-800">Phụ cấp PTTT (đồng)</th>
                                        <th colSpan={2} className="px-4 py-2 border-b border-gray-200 text-center bg-orange-50 text-orange-800">Thời gian thực hiện (phút)</th>
                                    </tr>
                                    <tr>
                                        {/* Prices */}
                                        <th className="px-4 py-2 border-r border-gray-200 w-[120px] text-center bg-blue-50/50">Chính</th>
                                        <th className="px-4 py-2 border-r border-gray-200 w-[120px] text-center bg-blue-50/50">Phụ</th>
                                        <th className="px-4 py-2 border-r border-gray-200 w-[120px] text-center bg-blue-50/50">Giúp việc</th>
                                        {/* Times */}
                                        <th className="px-4 py-2 border-r border-gray-200 w-[100px] text-center bg-orange-50/50">Tối thiểu</th>
                                        <th className="px-4 py-2 w-[100px] text-center bg-orange-50/50">Tối đa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Section: Phẫu thuật */}
                                    <tr className="bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md">
                                        <td colSpan={6} className="px-4 py-3 text-white uppercase text-sm font-bold tracking-wide border-b border-indigo-400">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                                Phẫu thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {SURGERY_TYPES.map((type, idx) => (
                                        <tr
                                            key={type}
                                            className={`border-b transition-all duration-200 cursor-pointer group
                                                hover:bg-indigo-50 hover:shadow-lg hover:scale-[1.01] hover:z-10 relative
                                                ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                                            `}
                                        >
                                            <td className="px-4 py-2.5 font-medium border-r pl-8">
                                                <span className="text-gray-700">{type === 'PĐB' ? 'Loại Đặc biệt' : type.replace("P", "Loại ")}</span>
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Chính')}
                                                    onChange={(val) => handlePriceChange(type, 'Chính', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 rounded-md bg-white hover:bg-indigo-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Phụ')}
                                                    onChange={(val) => handlePriceChange(type, 'Phụ', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 rounded-md bg-white hover:bg-indigo-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Giúp việc')}
                                                    onChange={(val) => handlePriceChange(type, 'Giúp việc', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 rounded-md bg-white hover:bg-indigo-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'min')}
                                                    onChange={(val) => handleTimeChange(type, 'min', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 rounded-md bg-white hover:bg-orange-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'max')}
                                                    onChange={(val) => handleTimeChange(type, 'max', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 rounded-md bg-white hover:bg-orange-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Section: Thủ thuật */}
                                    <tr className="bg-gradient-to-r from-teal-600 to-teal-500 shadow-md">
                                        <td colSpan={6} className="px-4 py-3 text-white uppercase text-sm font-bold tracking-wide border-b border-t border-teal-400">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                                Thủ thuật
                                            </span>
                                        </td>
                                    </tr>
                                    {PROCEDURE_TYPES.map((type, idx) => (
                                        <tr
                                            key={type}
                                            className={`border-b transition-all duration-200 cursor-pointer group
                                                hover:bg-teal-50 hover:shadow-lg hover:scale-[1.01] hover:z-10 relative
                                                ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                                            `}
                                        >
                                            <td className="px-4 py-2.5 font-medium border-r pl-8">
                                                <span className="text-gray-700">
                                                    {type === 'TĐB' ? 'Loại Đặc biệt' : type === 'TKPL' ? 'Không phân loại' : type.replace("T", "Loại ")}
                                                </span>
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Chính')}
                                                    onChange={(val) => handlePriceChange(type, 'Chính', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 rounded-md bg-white hover:bg-teal-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Phụ')}
                                                    onChange={(val) => handlePriceChange(type, 'Phụ', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 rounded-md bg-white hover:bg-teal-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r">
                                                <NumberInput
                                                    value={getPrice(type, 'Giúp việc')}
                                                    onChange={(val) => handlePriceChange(type, 'Giúp việc', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-teal-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 rounded-md bg-white hover:bg-teal-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 border-r bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'min')}
                                                    onChange={(val) => handleTimeChange(type, 'min', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 rounded-md bg-white hover:bg-orange-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                            <td className="p-1.5 bg-orange-50/20">
                                                <NumberInput
                                                    value={getTime(type, 'max')}
                                                    onChange={(val) => handleTimeChange(type, 'max', val)}
                                                    className="w-full px-3 py-1.5 text-right text-gray-900 border border-gray-200 group-hover:border-orange-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 rounded-md bg-white hover:bg-orange-50/50 outline-none transition-all shadow-sm group-hover:shadow"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}


                {activeSubTab === 'machines' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-yellow-800">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-bold mb-1">Cấu hình bỏ qua lỗi thiếu máy</p>
                                <p>Nhập tên (hoặc một phần tên) của phẫu thuật/thủ thuật để hệ thống không báo lỗi "Thiếu mã máy" đối với các dịch vụ này.</p>
                            </div>
                        </div>

                        <div className="max-w-2xl">
                            <h4 className="font-bold text-gray-900 mb-3 block">Danh sách tên PTTT bỏ qua kiểm tra máy</h4>

                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newMachineName}
                                    onChange={(e) => setNewMachineName(e.target.value)}
                                    placeholder="Nhập tên PTTT (ví dụ: bó bột, nắn trật khớp...)"
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddMachineName()}
                                />
                                <button
                                    onClick={handleAddMachineName}
                                    disabled={!newMachineName.trim()}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" /> Thêm
                                </button>
                            </div>

                            <div className="bg-white rounded-lg p-2 max-h-[400px] overflow-y-auto border border-emerald-200 shadow-inner">
                                {config.ignoredMachineNames.length === 0 && <p className="text-gray-400 text-sm italic p-4 text-center">Chưa có tên nào trong danh sách.</p>}
                                {config.ignoredMachineNames.length > 0 && (
                                    <p className="text-emerald-700 font-bold text-sm p-3 bg-emerald-100 rounded-lg mb-3 text-center">
                                        Có {config.ignoredMachineNames.length} phẫu thuật, thủ thuật không cần sử dụng máy
                                    </p>
                                )}
                                {config.ignoredMachineNames.map((name, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-3 rounded shadow-sm mb-2 last:mb-0 border ${idx % 2 === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className="w-8 h-8 flex items-center justify-center bg-emerald-600 text-white rounded-full text-xs font-bold">{idx + 1}</span>
                                            <span className="text-sm text-gray-700 font-medium">{name}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newNames = config.ignoredMachineNames.filter(n => n !== name);
                                                updateConfig({ ignoredMachineNames: newNames });
                                            }}
                                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                                            title="Xóa"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
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
        </div>
    );
};
