import React, { createContext, useContext, useEffect, useState } from 'react';
import { ref, onValue, set } from "firebase/database";
import { db } from "../lib/firebase";

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

export interface AppConfig {
    priceConfig: { [key: string]: RolePrice };
    timeRules: { [key: string]: TimeRule };
    roleOrder: Record<string, number>;
    ignoredMachineCodes: string[]; // List of PTTT that don't need machine codes
    ignoredMachineNames: string[]; // List of Surgery Names that don't need machine codes
}

interface ConfigContextType {
    config: AppConfig;
    updateConfig: (newConfig: Partial<AppConfig>) => void;
    resetConfig: () => void;
    isLoaded: boolean;
}

// --- Defaults ---
const DEFAULT_PRICE_CONFIG: { [key: string]: RolePrice } = {
    "PĐB": { "Chính": 280000, "Phụ": 0, "Giúp việc": 0 },
    "P1": { "Chính": 125000, "Phụ": 76000, "Giúp việc": 38000 },
    "P2": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
    "P3": { "Chính": 50000, "Phụ": 38000, "Giúp việc": 25000 },
    "TĐB": { "Chính": 125000, "Phụ": 76000, "Giúp việc": 38000 },
    "T1": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
    "T2": { "Chính": 50000, "Phụ": 38000, "Giúp việc": 25000 },
    "T3": { "Chính": 30000, "Phụ": 25000, "Giúp việc": 15000 },
    "TKPL": { "Chính": 20000, "Phụ": 20000, "Giúp việc": 20000 },
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

export const DEFAULT_CONFIG: AppConfig = {
    priceConfig: DEFAULT_PRICE_CONFIG,
    timeRules: DEFAULT_TIME_RULES,
    roleOrder: DEFAULT_ROLE_ORDER,
    ignoredMachineCodes: ["K0", "K1"],
    ignoredMachineNames: []
};

// --- Context ---
const ConfigContext = createContext<ConfigContextType>({
    config: DEFAULT_CONFIG,
    updateConfig: () => { },
    resetConfig: () => { },
    isLoaded: false,
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

    const updateConfig = (newPart: Partial<AppConfig>) => {
        // Merge newPart with the current config to create the full object to save.

        const fullNewConfig = { ...config, ...newPart };

        // Deep merge for nested objects if newPart only contains partial updates to them.
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

    return (
        <ConfigContext.Provider value={{ config, updateConfig, resetConfig, isLoaded }}>
            {children}
        </ConfigContext.Provider>
    );
};
