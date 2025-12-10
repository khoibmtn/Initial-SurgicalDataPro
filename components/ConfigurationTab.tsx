import React, { } from 'react';
import * as XLSX from 'xlsx';
import { useConfig } from '../contexts/ConfigContext';
import { Save, RotateCcw, Download, Upload, DollarSign, Clock } from 'lucide-react';

export const ConfigurationTab: React.FC = () => {
    const { config, updateConfig, resetConfig } = useConfig();

    const [activeSubTab, setActiveSubTab] = React.useState<'price' | 'time' | 'no-machine'>('price');
    const [newIgnoredName, setNewIgnoredName] = React.useState('');

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

    const handleAddIgnoredName = () => {
        const name = newIgnoredName.trim();
        if (!name) return;

        // Prevent duplicates
        if (config.ignoredMachineNames?.includes(name)) {
            alert("Tên phẫu thuật này đã có trong danh sách!");
            return;
        }

        const newList = [...(config.ignoredMachineNames || []), name];
        updateConfig({ ignoredMachineNames: newList });
        setNewIgnoredName('');
    };

    const handleDeleteIgnoredName = (nameToDelete: string) => {
        const newList = (config.ignoredMachineNames || []).filter(n => n !== nameToDelete);
        updateConfig({ ignoredMachineNames: newList });
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

        // --- 3. Tạo Sheet Không Cần Máy ---
        const noMachineHeader = ["Tên phẫu thuật, thủ thuật", "Không cần máy thực hiện"];
        const noMachineData: any[][] = [noMachineHeader];

        (config.ignoredMachineNames || []).forEach(name => {
            noMachineData.push([name, true]); // Mark as true (checked)
        });

        const wsNoMachine = XLSX.utils.aoa_to_sheet(noMachineData);

        // --- 4. Tạo Workbook và Xuất file ---
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsPrice, "DON_GIA");
        XLSX.utils.book_append_sheet(wb, wsTime, "THOI_GIAN");
        XLSX.utils.book_append_sheet(wb, wsNoMachine, "KHONG_CAN_MAY");

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
                let hasData = false;

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
                    hasData = true;
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
                    hasData = true;
                }

                // --- 3. Đọc Sheet Không Cần Máy ---
                const noMachineSheet = workbook.Sheets["KHONG_CAN_MAY"];
                if (noMachineSheet) {
                    const rows: any[][] = XLSX.utils.sheet_to_json(noMachineSheet, { header: 1 });
                    const newIgnoredList: string[] = [];
                    // Row structure: [Name, Checked]
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const name = (row[0] || "").toString().trim();
                        const isChecked = row[1]; // boolean or string usually
                        if (name && (isChecked === true || String(isChecked).toLowerCase() === 'true')) {
                            newIgnoredList.push(name);
                        }
                    }
                    newConfig.ignoredMachineNames = newIgnoredList;
                    hasData = true;
                }

                if (hasData) {
                    updateConfig(newConfig);
                    alert("Cấu hình đã được cập nhật từ file Excel!");
                } else {
                    alert("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại tên sheet (DON_GIA, THOI_GIAN, KHONG_CAN_MAY).");
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
        <div className="space-y-6 animate-fade-in">

            {/* Header Actions */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Cấu hình hệ thống</h2>
                    <p className="text-sm text-gray-500">Quản lý thù lao, thời gian và các quy định khác</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleManualSave} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">
                        <Save className="h-4 w-4" /> Lưu cấu hình
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer shadow-sm">
                        <Upload className="h-4 w-4" />
                        Nhập Excel
                        <input type="file" accept=".xlsx" onChange={importConfig} className="hidden" />
                    </label>
                    <button onClick={exportConfig} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm">
                        <Download className="h-4 w-4" /> Xuất Excel
                    </button>
                    <button onClick={resetConfig} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 shadow-sm">
                        <RotateCcw className="h-4 w-4" /> Khôi phục gốc
                    </button>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveSubTab('price')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeSubTab === 'price' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Phụ cấp phẫu thuật, thủ thuật
                </button>
                <button
                    onClick={() => setActiveSubTab('time')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeSubTab === 'time' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Thời gian thực hiện
                </button>
                <button
                    onClick={() => setActiveSubTab('no-machine')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeSubTab === 'no-machine' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Phẫu thuật không máy
                </button>
            </div>


            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">

                {/* 1. PRICE CONFIG TAB */}
                {activeSubTab === 'price' && (
                    <div className="animate-fade-in">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                            <div className="bg-green-100 p-1.5 rounded-md">
                                <DollarSign className="h-5 w-5 text-green-700" />
                            </div>
                            <h3 className="font-semibold text-gray-900">Đơn giá phụ cấp (VND)</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">
                                <div className="col-span-2">Loại PTTT</div>
                                <div className="col-span-10 grid grid-cols-3 gap-4">
                                    <div className="text-right">Chính</div>
                                    <div className="text-right">Phụ</div>
                                    <div className="text-right">Giúp việc</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {ORDERED_KEYS.map(key => (
                                    <div key={key} className="grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-all">
                                        <div className="col-span-2 font-bold text-gray-700">{key}</div>
                                        <div className="col-span-10 grid grid-cols-3 gap-4">
                                            <input
                                                type="text"
                                                value={config.priceConfig[key]?.["Chính"]?.toLocaleString('vi-VN')}
                                                onChange={(e) => handlePriceChange(key, "Chính", e.target.value)}
                                                className="w-full text-right font-mono text-sm bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                            />
                                            <input
                                                type="text"
                                                value={config.priceConfig[key]?.["Phụ"]?.toLocaleString('vi-VN')}
                                                onChange={(e) => handlePriceChange(key, "Phụ", e.target.value)}
                                                className="w-full text-right font-mono text-sm bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                            />
                                            <input
                                                type="text"
                                                value={config.priceConfig[key]?.["Giúp việc"]?.toLocaleString('vi-VN')}
                                                onChange={(e) => handlePriceChange(key, "Giúp việc", e.target.value)}
                                                className="w-full text-right font-mono text-sm bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-green-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. TIME CONFIG TAB */}
                {activeSubTab === 'time' && (
                    <div className="animate-fade-in">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                            <div className="bg-blue-100 p-1.5 rounded-md">
                                <Clock className="h-5 w-5 text-blue-700" />
                            </div>
                            <h3 className="font-semibold text-gray-900">Quy định thời gian (phút)</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-3">
                                <div className="col-span-2">Loại</div>
                                <div className="col-span-10 grid grid-cols-2 gap-4">
                                    <div className="text-center">Tối thiểu</div>
                                    <div className="text-center">Tối đa</div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {ORDERED_KEYS.map(key => (
                                    <div key={key} className="grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-all">
                                        <span className="col-span-2 font-bold text-gray-700">{key}</span>
                                        <div className="col-span-10 grid grid-cols-2 gap-4">
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={config.timeRules[key]?.min}
                                                    onChange={(e) => handleTimeRuleChange(key, 'min', e.target.value)}
                                                    className="w-full font-mono text-center bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                                <span className="absolute right-3 top-2.5 text-xs text-gray-400">min</span>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={config.timeRules[key]?.max}
                                                    onChange={(e) => handleTimeRuleChange(key, 'max', e.target.value)}
                                                    className="w-full font-mono text-center bg-white border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                                <span className="absolute right-3 top-2.5 text-xs text-gray-400">min</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. NO MACHINE TAB */}
                {activeSubTab === 'no-machine' && (
                    <div className="animate-fade-in flex flex-col h-full">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
                            <div className="bg-orange-100 p-1.5 rounded-md">
                                <DollarSign className="h-5 w-5 text-orange-700" /> {/* Reusing Icon or importing a new one like ZapOff */}
                            </div>
                            <h3 className="font-semibold text-gray-900">Danh sách Phẫu thuật, Thủ thuật không sử dụng máy</h3>
                        </div>

                        <div className="p-6 flex flex-col gap-6">
                            {/* Add Form */}
                            <div className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên phẫu thuật, thủ thuật</label>
                                    <input
                                        type="text"
                                        value={newIgnoredName}
                                        onChange={(e) => setNewIgnoredName(e.target.value)}
                                        placeholder="Ví dụ: Phẫu thuật cắt amidan..."
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="flex items-center h-10 pb-1">
                                    <label className="flex items-center gap-2 text-sm text-gray-700 font-medium cursor-pointer select-none">
                                        <input type="checkbox" checked disabled className="w-4 h-4 text-indigo-600 rounded" />
                                        Không cần máy thực hiện
                                    </label>
                                </div>
                                <button
                                    onClick={handleAddIgnoredName}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 mb-0.5"
                                >
                                    Thêm vào danh sách
                                </button>
                            </div>

                            {/* List */}
                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider grid grid-cols-12 gap-4">
                                    <div className="col-span-1">STT</div>
                                    <div className="col-span-9">Tên phẫu thuật, thủ thuật</div>
                                    <div className="col-span-2 text-center">Thao tác</div>
                                </div>
                                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto bg-white">
                                    {(config.ignoredMachineNames && config.ignoredMachineNames.length > 0) ? (
                                        config.ignoredMachineNames.map((name, index) => (
                                            <div key={index} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                                                <div className="col-span-1 text-gray-500 text-sm">{index + 1}</div>
                                                <div className="col-span-9 font-medium text-gray-900">{name}</div>
                                                <div className="col-span-2 text-center">
                                                    <button
                                                        onClick={() => handleDeleteIgnoredName(name)}
                                                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                    >
                                                        Xóa
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-gray-500 italic">
                                            Chưa có phẫu thuật nào trong danh sách.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
