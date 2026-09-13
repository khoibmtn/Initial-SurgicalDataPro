// ─── Admin Settings Config ─────────────────────────────────────────────────────
// Subtab: Hành chính > Hành chính (Hospital name + Working hours)
// Extracted from ConfigurationTab.tsx lines 1336-1852

import React from 'react';
import { Building2, Clock, Save } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

const handleWorkingHoursTimeChange = (val: string, setter: (v: string) => void) => {
    let clean = val.replace(/[^0-9]/g, '');
    if (clean.length > 4) clean = clean.substring(0, 4);
    let hh = clean.substring(0, 2);
    let mm = clean.substring(2, 4);
    if (hh.length === 2 && parseInt(hh, 10) > 23) hh = '23';
    if (mm.length === 2 && parseInt(mm, 10) > 59) mm = '59';
    let formatted = hh;
    if (clean.length >= 3) formatted = `${hh}:${mm}`;
    setter(formatted);
};

const validateDate = (dateStr: string): boolean => {
    if (dateStr.length !== 5) return false;
    const parts = dateStr.split('/');
    if (parts.length !== 2) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month)) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) return false;
    return true;
};

const isTimeBefore = (time1: string, time2: string): boolean => {
    if (!time1 || !time2 || time1.length < 5 || time2.length < 5) return true;
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return (h1 * 60 + m1) < (h2 * 60 + m2);
};

// ── Working Hours Time Input (reusable within this module) ───────────────────

interface TimeInputProps {
    value: string;
    season: 'summer' | 'winter';
    field: 'morningFrom' | 'morningTo' | 'afternoonFrom' | 'afternoonTo';
    defaultVal: string;
    pairedField?: string; // The "from" time to validate "to" against
    isLocked: boolean;
    config: any;
    updateConfig: (c: any) => void;
}

const TimeInput: React.FC<TimeInputProps> = ({ value, season, field, defaultVal, pairedField, isLocked, config, updateConfig }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isLocked) return;
        handleWorkingHoursTimeChange(e.target.value, (formatted) => {
            if (pairedField && formatted.length === 5 && !isTimeBefore(pairedField, formatted)) return;
            updateConfig({
                workingHours: {
                    ...config.workingHours,
                    [season]: { ...config.workingHours?.[season], [field]: formatted }
                }
            });
        });
    };

    const handleBlur = () => {
        if (isLocked) return;
        const val = value;
        if (val.length !== 5 || val === '00:00' || (pairedField && val.length === 5 && !isTimeBefore(pairedField, val))) {
            updateConfig({
                workingHours: {
                    ...config.workingHours,
                    [season]: { ...config.workingHours?.[season], [field]: defaultVal }
                }
            });
        }
    };

    return (
        <input
            type="text"
            value={value}
            disabled={isLocked}
            readOnly={isLocked}
            tabIndex={isLocked ? -1 : undefined}
            onChange={handleChange}
            onBlur={handleBlur}
            maxLength={5}
            placeholder="HH:mm"
            className={`w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs outline-none ${isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none select-none' : 'bg-white focus:ring-1 focus:ring-blue-500'}`}
        />
    );
};

// ── Date Input ───────────────────────────────────────────────────────────────

interface DateInputProps {
    value: string;
    season: 'summer' | 'winter';
    field: 'dateFrom' | 'dateTo';
    defaultVal: string;
    isLocked: boolean;
    config: any;
    updateConfig: (c: any) => void;
}

const DateInput: React.FC<DateInputProps> = ({ value, season, field, defaultVal, isLocked, config, updateConfig }) => (
    <input
        type="text"
        value={value}
        disabled={isLocked}
        readOnly={isLocked}
        tabIndex={isLocked ? -1 : undefined}
        onChange={(e) => {
            if (isLocked) return;
            const val = e.target.value.replace(/-/g, '/');
            updateConfig({
                workingHours: {
                    ...config.workingHours,
                    [season]: { ...config.workingHours?.[season], [field]: val }
                }
            });
        }}
        onBlur={() => {
            if (isLocked) return;
            if (!validateDate(value)) {
                updateConfig({
                    workingHours: {
                        ...config.workingHours,
                        [season]: { ...config.workingHours?.[season], [field]: defaultVal }
                    }
                });
            }
        }}
        placeholder="DD/MM"
        className={`w-[80px] px-2.5 py-1 border border-gray-200 rounded text-center font-mono text-xs outline-none ${isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none select-none' : 'bg-white focus:ring-1 focus:ring-blue-500'}`}
    />
);

// ── Time Row (pair of summer + winter inputs for a period) ───────────────────

interface TimeRowProps {
    label: string;
    fromField: 'morningFrom' | 'afternoonFrom';
    toField: 'morningTo' | 'afternoonTo';
    summerFromDefault: string;
    summerToDefault: string;
    winterFromDefault: string;
    winterToDefault: string;
    isLocked: boolean;
    config: any;
    updateConfig: (c: any) => void;
    striped?: boolean;
}

const TimeRow: React.FC<TimeRowProps> = ({ label, fromField, toField, summerFromDefault, summerToDefault, winterFromDefault, winterToDefault, isLocked, config, updateConfig, striped }) => (
    <tr className={striped ? 'bg-gray-50/40 hover:bg-gray-50' : 'hover:bg-gray-50/50'}>
        <td className="px-4 py-2.5 border-r border-gray-100 font-medium text-gray-700">{label}</td>
        <td className="px-4 py-2.5 border-r border-gray-100">
            <div className="flex items-center justify-center gap-2">
                <span className="text-gray-500">Từ</span>
                <TimeInput value={config.workingHours?.summer?.[fromField] || ''} season="summer" field={fromField} defaultVal={summerFromDefault} isLocked={isLocked} config={config} updateConfig={updateConfig} />
                <span className="text-gray-500">đến</span>
                <TimeInput value={config.workingHours?.summer?.[toField] || ''} season="summer" field={toField} defaultVal={summerToDefault} pairedField={config.workingHours?.summer?.[fromField] || ''} isLocked={isLocked} config={config} updateConfig={updateConfig} />
            </div>
        </td>
        <td className="px-4 py-2.5">
            <div className="flex items-center justify-center gap-2">
                <span className="text-gray-500">Từ</span>
                <TimeInput value={config.workingHours?.winter?.[fromField] || ''} season="winter" field={fromField} defaultVal={winterFromDefault} isLocked={isLocked} config={config} updateConfig={updateConfig} />
                <span className="text-gray-500">đến</span>
                <TimeInput value={config.workingHours?.winter?.[toField] || ''} season="winter" field={toField} defaultVal={winterToDefault} pairedField={config.workingHours?.winter?.[fromField] || ''} isLocked={isLocked} config={config} updateConfig={updateConfig} />
            </div>
        </td>
    </tr>
);

// ── Main Component ───────────────────────────────────────────────────────────

export const AdminSettingsConfig: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { can, isAdmin } = useAuth();
    const isLocked = !isAdmin && !can('manage_admin_settings');

    return (
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
                        onChange={(e) => { if (!isLocked) updateConfig({ hospitalName: e.target.value }); }}
                        disabled={isLocked}
                        readOnly={isLocked}
                        tabIndex={isLocked ? -1 : undefined}
                        placeholder="Nhập tên bệnh viện hiển thị trên báo cáo..."
                        className={`flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm font-medium ${isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none select-none' : 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-800 bg-white'}`}
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

                <div className={`overflow-hidden border border-gray-200 rounded-xl bg-white ${isLocked ? 'pointer-events-none select-none opacity-80' : ''}`}>
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
                                        <DateInput value={config.workingHours?.summer?.dateFrom || ''} season="summer" field="dateFrom" defaultVal="01/05" isLocked={isLocked} config={config} updateConfig={updateConfig} />
                                        <span className="text-gray-500">Đến</span>
                                        <DateInput value={config.workingHours?.summer?.dateTo || ''} season="summer" field="dateTo" defaultVal="30/09" isLocked={isLocked} config={config} updateConfig={updateConfig} />
                                    </div>
                                </td>
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-gray-500">Từ</span>
                                        <DateInput value={config.workingHours?.winter?.dateFrom || ''} season="winter" field="dateFrom" defaultVal="01/10" isLocked={isLocked} config={config} updateConfig={updateConfig} />
                                        <span className="text-gray-500">Đến</span>
                                        <DateInput value={config.workingHours?.winter?.dateTo || ''} season="winter" field="dateTo" defaultVal="30/04" isLocked={isLocked} config={config} updateConfig={updateConfig} />
                                    </div>
                                </td>
                            </tr>
                            <TimeRow label="Buổi sáng" fromField="morningFrom" toField="morningTo" summerFromDefault="07:00" summerToDefault="11:30" winterFromDefault="07:30" winterToDefault="12:00" isLocked={isLocked} config={config} updateConfig={updateConfig} striped />
                            <TimeRow label="Buổi chiều" fromField="afternoonFrom" toField="afternoonTo" summerFromDefault="13:30" summerToDefault="17:00" winterFromDefault="13:30" winterToDefault="17:00" isLocked={isLocked} config={config} updateConfig={updateConfig} />
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
