import React, { createContext, useContext, useEffect, useState } from 'react';
import { ref, onValue, set } from "firebase/database";
import { db } from "../lib/firebase";
import { UISettings, StaffMember, MachineEntry, LaborAllowanceItem, LaborTimeItem, LaborTableItem, LaborConfigVersion } from "../types";
import {
    subscribeToAllowanceItems,
    subscribeToTimeItems,
    subscribeToTableItems,
    subscribeToLaborConfigs,
    getAllowanceForRecord,
    getTimeRuleForRecord,
    getTableLimitForRole
} from "../services/laborConfigService";

export interface TimeRule {
    min: number;
    max: number;
}

export interface RolePrice {
    "Chính": number;
    "Phụ": number;
    "Giúp việc": number;
}

export type SurgeryRole = "Chính" | "Phụ" | "Giúp việc";

export type StaffLimitOption = 0 | 1 | 2; // 0: No Check, 1: Max 1 table, 2: Max 2 tables

export interface StaffLimitConfig {
    surgeons: StaffLimitOption;        // PT Chính, PT Phụ
    anesthesiologists: StaffLimitOption; // BS GM
    support: StaffLimitOption;           // KTV GM, TDC
    assistants: StaffLimitOption;        // Giúp việc (Group 4)
}

export interface SeasonSchedule {
    dateFrom: string;      // DD-MM format
    dateTo: string;        // DD-MM format
    morningFrom: string;   // HH:mm format (24h)
    morningTo: string;     // HH:mm format (24h)
    afternoonFrom: string; // HH:mm format (24h)
    afternoonTo: string;   // HH:mm format (24h)
}

export interface WorkingHours {
    summer: SeasonSchedule;
    winter: SeasonSchedule;
}


export interface AppConfig {
    priceConfig: { [key: string]: RolePrice };
    timeRules: { [key: string]: TimeRule };
    roleOrder: Record<string, number>;
    ignoredMachineCodes: string[]; // List of PTTT that don't need machine codes
    ignoredMachineNames: string[]; // List of Surgery Names that don't need machine codes
    departments: string[]; // List of departments
    staffList: StaffMember[]; // List of medical staff members
    uiSettings: UISettings;
    staffLimits: StaffLimitConfig;
    hospitalName: string;
    workingHours?: WorkingHours;
    machineRegistry: MachineEntry[];
    // Timeline-based items
    allowanceItems?: LaborAllowanceItem[];
    timeItemsList?: LaborTimeItem[];
    tableItems?: LaborTableItem[];
    laborConfigs?: LaborConfigVersion[];
}

export interface ConfigContextType {
    config: AppConfig;
    updateConfig: (newConfig: Partial<AppConfig>) => void;
    resetConfig: () => void;
    isLoaded: boolean;
    getAllowance: (loai: string, date?: any) => RolePrice;
    getTimeRule: (loai: string, date?: any) => TimeRule;
    getTableLimit: (posKey: string, date?: any) => number;
}

// --- Defaults ---
const DEFAULT_PRICE_CONFIG: { [key: string]: RolePrice } = {
    "PĐB": { "Chính": 280000, "Phụ": 200000, "Giúp việc": 120000 },
    "P1": { "Chính": 125000, "Phụ": 90000, "Giúp việc": 70000 },
    "P2": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
    "P3": { "Chính": 50000, "Phụ": 30000, "Giúp việc": 15000 },
    "TĐB": { "Chính": 84000, "Phụ": 60000, "Giúp việc": 36000 },
    "T1": { "Chính": 37500, "Phụ": 27000, "Giúp việc": 21000 },
    "T2": { "Chính": 19500, "Phụ": 15000, "Giúp việc": 9000 },
    "T3": { "Chính": 15000, "Phụ": 9000, "Giúp việc": 4500 },
    "TKPL": { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
};

const DEFAULT_TIME_RULES: { [key: string]: TimeRule } = {
    "PĐB": { min: 180, max: 240 },
    "P1": { min: 120, max: 180 },
    "P2": { min: 60, max: 180 },
    "P3": { min: 60, max: 120 },
    "TĐB": { min: 180, max: 240 },
    "T1": { min: 120, max: 180 },
    "T2": { min: 60, max: 180 },
    "T3": { min: 60, max: 120 },
    "TKPL": { min: 0, max: 0 }
};

const DEFAULT_ROLE_ORDER: Record<string, number> = {
    "Chính": 1,
    "Phụ": 2,
    "Giúp việc": 3,
    "Vận hành máy": 4
};

const DEFAULT_UI_SETTINGS: UISettings = {
    rowsPerPage: 20,
    dateFormat: 'dd/mm/yyyy hh:mm',
    visibleColumns: {},
    searchableColumns: {},
    perReport: {
        daily: {
            rowsPerPage: 20,
            dateFormat: 'dd/mm/yyyy hh:mm',
            visibleColumns: {},
            searchableColumns: {}
        },
        monthly: {
            rowsPerPage: 20,
            dateFormat: 'dd/mm/yyyy hh:mm',
            visibleColumns: {},
            searchableColumns: {}
        }
    }
};

const DEFAULT_STAFF_LIMITS: StaffLimitConfig = {
    surgeons: 1,        // Default: Max 1 table
    anesthesiologists: 1, // Default: Max 1 table
    support: 2,          // Default: Max 2 tables
    assistants: 2        // Default: Max 2 tables
};

const DEFAULT_WORKING_HOURS: WorkingHours = {
    summer: {
        dateFrom: "01/05",      // May 1st
        dateTo: "30/09",        // September 30th
        morningFrom: "07:00",
        morningTo: "11:30",
        afternoonFrom: "13:30",
        afternoonTo: "17:00"
    },
    winter: {
        dateFrom: "01/10",      // October 1st
        dateTo: "30/04",        // April 30th
        morningFrom: "07:30",
        morningTo: "12:00",
        afternoonFrom: "13:30",
        afternoonTo: "17:00"
    }
};


export const DEFAULT_CONFIG: AppConfig = {
    priceConfig: DEFAULT_PRICE_CONFIG,
    timeRules: DEFAULT_TIME_RULES,
    roleOrder: DEFAULT_ROLE_ORDER,
    ignoredMachineCodes: ["K0", "K1"],
    ignoredMachineNames: [],
    departments: [],
    staffList: [],
    uiSettings: DEFAULT_UI_SETTINGS,
    staffLimits: DEFAULT_STAFF_LIMITS,
    hospitalName: "Trung tâm Y tế Thủy Nguyên",
    workingHours: DEFAULT_WORKING_HOURS,
    machineRegistry: []
};

// --- Context ---
const ConfigContext = createContext<ConfigContextType>({
    config: DEFAULT_CONFIG,
    updateConfig: () => { },
    resetConfig: () => { },
    isLoaded: false,
    getAllowance: (loai: string) => DEFAULT_PRICE_CONFIG[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
    getTimeRule: (loai: string) => DEFAULT_TIME_RULES[loai] || { min: 0, max: 0 },
    getTableLimit: () => 1,
});

export const useConfig = () => useContext(ConfigContext);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load config from Firebase on mount
    useEffect(() => {
        const configRef = ref(db, 'app_config');

        const unsubscribe = onValue(configRef, (snapshot) => {
            const data = snapshot.val();

            if (data) {
                // Deep merge incoming data with current/default state
                setConfig(prev => {
                    // Start with a fresh copy of DEFAULT_CONFIG to ensure all keys are present
                    const merged: AppConfig = { ...DEFAULT_CONFIG };

                    // Merge top-level properties from Firebase data
                    Object.assign(merged, data);

                    // Specific deep merge for priceConfig
                    if (data.priceConfig) {
                        merged.priceConfig = { ...DEFAULT_PRICE_CONFIG }; // Start with default prices
                        Object.keys(data.priceConfig).forEach(key => {
                            if (data.priceConfig[key]) {
                                merged.priceConfig[key] = {
                                    ...DEFAULT_PRICE_CONFIG[key], // Merge with default role prices for this surgery type
                                    ...data.priceConfig[key]
                                };
                            }
                        });
                    }

                    // Deep merge for timeRules
                    if (data.timeRules) {
                        merged.timeRules = { ...DEFAULT_TIME_RULES }; // Start with default time rules
                        Object.keys(data.timeRules).forEach(key => {
                            if (data.timeRules[key]) {
                                merged.timeRules[key] = {
                                    ...DEFAULT_TIME_RULES[key], // Merge with default time rule for this surgery type
                                    ...data.timeRules[key]
                                };
                            }
                        });
                    }

                    // Deep merge for uiSettings
                    if (data.uiSettings) {
                        merged.uiSettings = { ...DEFAULT_UI_SETTINGS, ...data.uiSettings };
                    }

                    // Deep merge for staffLimits
                    if (data.staffLimits) {
                        merged.staffLimits = { ...DEFAULT_STAFF_LIMITS, ...data.staffLimits };
                    }

                    // Deep merge for workingHours
                    if (data.workingHours) {
                        merged.workingHours = {
                            summer: { ...DEFAULT_WORKING_HOURS.summer, ...data.workingHours.summer },
                            winter: { ...DEFAULT_WORKING_HOURS.winter, ...data.workingHours.winter }
                        };
                    }


                    // Migrate old date format (DD-MM) to new format (DD/MM)
                    if (merged.workingHours) {
                        if (merged.workingHours.summer) {
                            if (merged.workingHours.summer.dateFrom) {
                                merged.workingHours.summer.dateFrom = merged.workingHours.summer.dateFrom.replace(/-/g, '/');
                            }
                            if (merged.workingHours.summer.dateTo) {
                                merged.workingHours.summer.dateTo = merged.workingHours.summer.dateTo.replace(/-/g, '/');
                            }
                        }
                        if (merged.workingHours.winter) {
                            if (merged.workingHours.winter.dateFrom) {
                                merged.workingHours.winter.dateFrom = merged.workingHours.winter.dateFrom.replace(/-/g, '/');
                            }
                            if (merged.workingHours.winter.dateTo) {
                                merged.workingHours.winter.dateTo = merged.workingHours.winter.dateTo.replace(/-/g, '/');
                            }
                        }
                    }

                    return merged;
                });
            } else {
                // If no data in DB, use DEFAULT_CONFIG.
                setConfig(DEFAULT_CONFIG);
            }
            setIsLoaded(true);
        }, (error) => {
            console.error("Firebase Read Error:", error);
            // Fallback to DEFAULT_CONFIG on error
            setConfig(DEFAULT_CONFIG);
            setIsLoaded(true);
        });

        // Cleanup subscription
        return () => unsubscribe();
    }, []);

    // Subscribe to timeline-based labor configs
    useEffect(() => {
        const unsubAllowance = subscribeToAllowanceItems((items) => {
            setConfig(prev => ({ ...prev, allowanceItems: items }));
        });
        const unsubTime = subscribeToTimeItems((items) => {
            setConfig(prev => ({ ...prev, timeItemsList: items }));
        });
        const unsubTable = subscribeToTableItems((items) => {
            setConfig(prev => ({ ...prev, tableItems: items }));
        });
        const unsubLabor = subscribeToLaborConfigs((versions) => {
            setConfig(prev => ({ ...prev, laborConfigs: versions }));
        });

        return () => {
            unsubAllowance();
            unsubTime();
            unsubTable();
            unsubLabor();
        };
    }, []);

    const updateConfig = (newPart: Partial<AppConfig>) => {
        // Merge newPart with the current config to create the full object to save.
        const fullNewConfig = { ...config, ...newPart };

        // Deep merge logic for specific objects is handled automatically by spread above for simple updates,
        // but for nested objects like priceConfig/timeRules/uiSettings, we need to be careful if newPart passes partials.

        if (newPart.priceConfig) {
            fullNewConfig.priceConfig = { ...config.priceConfig };
            Object.keys(newPart.priceConfig).forEach(key => {
                fullNewConfig.priceConfig[key] = {
                    ...config.priceConfig[key],
                    ...newPart.priceConfig[key]
                };
            });
        }

        if (newPart.timeRules) {
            fullNewConfig.timeRules = { ...config.timeRules };
            Object.keys(newPart.timeRules).forEach(key => {
                fullNewConfig.timeRules[key] = {
                    ...config.timeRules[key],
                    ...newPart.timeRules[key]
                };
            });
        }

        if (newPart.uiSettings) {
            fullNewConfig.uiSettings = {
                ...config.uiSettings,
                ...newPart.uiSettings,
                perReport: {
                    ...config.uiSettings?.perReport,
                    ...newPart.uiSettings?.perReport
                }
            };
            // Deep merge daily/monthly if they exist in newPart
            if (newPart.uiSettings.perReport?.daily) {
                fullNewConfig.uiSettings.perReport.daily = {
                    ...config.uiSettings?.perReport?.daily as any,
                    ...newPart.uiSettings.perReport.daily
                };
            }
            if (newPart.uiSettings.perReport?.monthly) {
                fullNewConfig.uiSettings.perReport.monthly = {
                    ...config.uiSettings?.perReport?.monthly as any,
                    ...newPart.uiSettings.perReport.monthly
                };
            }
        }

        if (newPart.staffLimits) {
            fullNewConfig.staffLimits = { ...config.staffLimits, ...newPart.staffLimits };
        }

        if (newPart.workingHours) {
            fullNewConfig.workingHours = {
                summer: { ...config.workingHours?.summer, ...newPart.workingHours.summer },
                winter: { ...config.workingHours?.winter, ...newPart.workingHours.winter }
            };
        }


        // Write to Firebase
        const configRef = ref(db, 'app_config');
        set(configRef, fullNewConfig).catch((err) => {
            console.error("Firebase Write Error:", err);
            alert("Lỗi khi lưu cấu hình lên server: " + err.message);
        });
    };

    const resetConfig = () => {
        if (confirm("Bạn có chắc chắn muốn khôi phục cài đặt gốc? Hành động này sẽ cập nhật cấu hình trên server!")) {
            const configRef = ref(db, 'app_config');
            set(configRef, DEFAULT_CONFIG).catch((err) => {
                console.error("Firebase Reset Error:", err);
                alert("Lỗi khi khôi phục cài đặt gốc lên server: " + err.message);
            });
        }
    };

    const getAllowance = (loai: string, date?: any): RolePrice => {
        return getAllowanceForRecord(loai, date, config.allowanceItems, config.priceConfig);
    };

    const getTimeRule = (loai: string, date?: any): TimeRule => {
        return getTimeRuleForRecord(loai, date, config.timeItemsList, config.timeRules);
    };

    const getTableLimit = (posKeyOrRole: string, date?: any): number => {
        return getTableLimitForRole(posKeyOrRole, date, config.tableItems, config.staffLimits);
    };

    return (
        <ConfigContext.Provider value={{ config, updateConfig, resetConfig, isLoaded, getAllowance, getTimeRule, getTableLimit }}>
            {children}
        </ConfigContext.Provider>
    );
};
