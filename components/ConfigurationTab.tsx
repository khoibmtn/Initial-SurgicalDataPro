import React, { } from 'react';
import * as XLSX from 'xlsx';
import { useConfig } from '../contexts/ConfigContext';
import { Save, RotateCcw, Download, Upload, DollarSign, Clock } from 'lucide-react';

export const ConfigurationTab: React.FC = () => {
    const { config, updateConfig, resetConfig } = useConfig();

    const handlePriceChange = (type: string, role: string, value: string) => {
        const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num)) {
            updateConfig({
                priceConfig: {
                    ...config.priceConfig,
                    [type]: {
                        ...config.priceConfig[type],
                        [role]: num
                    }
                }
            });
        }
    };

    const handleTimeRuleChange = (key: string, field: 'min' | 'max', value: string) => {
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            updateConfig({
                timeRules: {
                    ...config.timeRules,
                    [key]: {
                        ...config.timeRules[key],
                        [field]: num
                    }
                }
            });
        }
    };

    const exportConfig = () => {
        // --- 1. Tạo Sheet Đơn Giá ---
        const priceHeader = ["Loại PTTT", "Chính", "Phụ", "Giúp việc"];
        const priceData = [priceHeader];

        ORDERED_KEYS.forEach(key => {
            const row = [
                key,
                config.priceConfig[key]?.["Chính"] || 0,
                config.priceConfig[key]?.["Phụ"] || 0,
                config.priceConfig[key]?.["Giúp việc"] || 0,
            ];
            priceData.push(row);
        });

        const wsPrice = XLSX.utils.aoa_to_sheet(priceData);

        // --- 2. Tạo Sheet Thời Gian ---
        const timeHeader = ["Loại PTTT", "Tối thiểu (phút)", "Tối đa (phút)"];
        const timeData = [timeHeader];

        ORDERED_KEYS.forEach(key => {
            const row = [
                key,
                config.timeRules[key]?.min || 0,
                config.timeRules[key]?.max || 0
            ];
            timeData.push(row);
        });

        const wsTime = XLSX.utils.aoa_to_sheet(timeData);

        // --- 3. Tạo Workbook và Xuất file ---
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsPrice, "DON_GIA");
        XLSX.utils.book_append_sheet(wb, wsTime, "THOI_GIAN");

        XLSX.writeFile(wb, "cau_hinh_pttt.xlsx");
    };

    const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const newConfig: any = {};

                // --- 1. Đọc Sheet Đơn Giá ---
                const priceSheet = workbook.Sheets["DON_GIA"];
                if (priceSheet) {
                    const priceRows: any[][] = XLSX.utils.sheet_to_json(priceSheet, { header: 1 });
                    // Bỏ header (row 0), đọc từ row 1
                    const parsedPriceConfig: Record<string, any> = { ...config.priceConfig };

                    for (let i = 1; i < priceRows.length; i++) {
                        const row = priceRows[i];
                        const key = (row[0] || "").toString().trim(); // Loại PTTT
                        if (key && ORDERED_KEYS.includes(key)) {
                            parsedPriceConfig[key] = {
                                "Chính": Number(row[1]) || 0,
                                "Phụ": Number(row[2]) || 0,
                                "Giúp việc": Number(row[3]) || 0
                            };
                        }
                    }
                    newConfig.priceConfig = parsedPriceConfig;
                }

                // --- 2. Đọc Sheet Thời Gian ---
                const timeSheet = workbook.Sheets["THOI_GIAN"];
                if (timeSheet) {
                    const timeRows: any[][] = XLSX.utils.sheet_to_json(timeSheet, { header: 1 });
                    const parsedTimeRules: Record<string, any> = { ...config.timeRules };

                    for (let i = 1; i < timeRows.length; i++) {
                        const row = timeRows[i];
                        const key = (row[0] || "").toString().trim(); // Loại PTTT
                        if (key && ORDERED_KEYS.includes(key)) {
                            parsedTimeRules[key] = {
                                min: Number(row[1]) || 0,
                                max: Number(row[2]) || 0
                            };
                        }
                    }
                    newConfig.timeRules = parsedTimeRules;
                }

                if (newConfig.priceConfig || newConfig.timeRules) {
                    updateConfig(newConfig);
                    alert("Cấu hình đã được cập nhật từ file Excel!");
                } else {
                    alert("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại tên sheet (DON_GIA, THOI_GIAN).");
                }

            } catch (err) {
                console.error(err);
                alert("File cấu hình không hợp lệ hoặc lỗi khi đọc file.");
            }
        };
        reader.readAsArrayBuffer(file);
        // Reset value
        e.target.value = '';
    };

    const handleManualSave = () => {
        // Since auto-save is enabled in Provider via useEffect, 
        // this button serves as a reassurance and visual confirmation.
        // We can also force a re-render or similar if needed, but context is reactive.
        alert("Đã lưu cấu hình thành công!");
    };

    const ORDERED_KEYS = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];

    return (
        <div className="space-y-8 animate-fade-in">

            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Cấu hình hệ thống</h2>
                    <p className="text-sm text-gray-500">Quản lý đơn giá và quy định thời gian</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleManualSave} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">
                        <Save className="h-4 w-4" /> Lưu cấu hình
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer shadow-sm">
                        <Upload className="h-4 w-4" />
                        Nhập file
                        <input type="file" accept=".xlsx" onChange={importConfig} className="hidden" />
                    </label>
                    <button onClick={exportConfig} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm">
                        <Download className="h-4 w-4" /> Xuất file
                    </button>
                    <button onClick={resetConfig} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 shadow-sm">
                        <RotateCcw className="h-4 w-4" /> Khôi phục gốc
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* PRICE CONFIG */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden col-span-1 lg:col-span-2">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                        <div className="bg-green-100 p-1.5 rounded-md">
                            <DollarSign className="h-5 w-5 text-green-700" />
                        </div>
                        <h3 className="font-semibold text-gray-900">Đơn giá thù lao (VND)</h3>
                    </div>
                    <div className="p-6">
                        {/* Header Row */}
                        <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">
                            <div className="col-span-2">Loại PTTT</div>
                            <div className="col-span-3 text-right">Chính</div>
                            <div className="col-span-3 text-right">Phụ</div>
                            <div className="col-span-3 text-right">Giúp việc</div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            {ORDERED_KEYS.map(key => (
                                <div key={key} className="grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 rounded-lg hover:border-gray-200 border border-transparent transition-all">
                                    <div className="col-span-2 font-bold text-gray-700">{key}</div>

                                    {/* Chính */}
                                    <div className="col-span-3 relative">
                                        <input
                                            type="text"
                                            value={config.priceConfig[key]?.["Chính"]?.toLocaleString('vi-VN')}
                                            onChange={(e) => handlePriceChange(key, "Chính", e.target.value)}
                                            className="w-full text-right font-mono text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                        />
                                    </div>

                                    {/* Phụ */}
                                    <div className="col-span-3 relative">
                                        <input
                                            type="text"
                                            value={config.priceConfig[key]?.["Phụ"]?.toLocaleString('vi-VN')}
                                            onChange={(e) => handlePriceChange(key, "Phụ", e.target.value)}
                                            className="w-full text-right font-mono text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                        />
                                    </div>

                                    {/* Giúp việc */}
                                    <div className="col-span-4 lg:col-span-3 relative">
                                        <input
                                            type="text"
                                            value={config.priceConfig[key]?.["Giúp việc"]?.toLocaleString('vi-VN')}
                                            onChange={(e) => handlePriceChange(key, "Giúp việc", e.target.value)}
                                            className="w-full text-right font-mono text-sm text-gray-900 bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* TIME CONFIG */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                        <div className="bg-blue-100 p-1.5 rounded-md">
                            <Clock className="h-5 w-5 text-blue-700" />
                        </div>
                        <h3 className="font-semibold text-gray-900">Thời gian quy định (phút)</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">
                                <div className="col-span-2">Loại</div>
                                <div className="col-span-10 grid grid-cols-2 gap-4">
                                    <div>Tối thiểu</div>
                                    <div>Tối đa</div>
                                </div>
                            </div>

                            {ORDERED_KEYS.map(key => (
                                <div key={key} className="grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 rounded-lg hover:border-gray-200 border border-transparent transition-all">
                                    <span className="col-span-2 font-bold text-gray-700">{key}</span>
                                    <div className="col-span-10 grid grid-cols-2 gap-4">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={config.timeRules[key]?.min}
                                                onChange={(e) => handleTimeRuleChange(key, 'min', e.target.value)}
                                                className="w-full font-mono text-center bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-400">min</span>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={config.timeRules[key]?.max}
                                                onChange={(e) => handleTimeRuleChange(key, 'max', e.target.value)}
                                                className="w-full font-mono text-center bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-400">min</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
