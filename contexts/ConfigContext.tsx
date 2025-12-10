import React, { createContext, useContext, useEffect, useState } from 'react';

// --- Types ---
export type SurgeryType = "PĐB" | "P1" | "P2" | "P3" | "TĐB" | "T1" | "T2" | "T3" | "TKPL";

export interface TimeRule {
    min: number;
    max: number;
}

export type SurgeryRole = "Chính" | "Phụ" | "Giúp việc";

export interface AppConfig {
    priceConfig: Record<string, Record<SurgeryRole, number>>;
    timeRules: Record<string, TimeRule>;
    roleOrder: Record<string, number>;
    ignoredMachineCodes: string[]; // List of PTTT that don't need machine codes
}

interface ConfigContextType {
    config: AppConfig;
    updateConfig: (newConfig: Partial<AppConfig>) => void;
    resetConfig: () => void;
}

// --- Defaults ---
const DEFAULT_PRICE_CONFIG: Record<string, Record<SurgeryRole, number>> = {
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

const DEFAULT_TIME_RULES: Record<string, TimeRule> = {
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
    "PT Chính": 1,
    "PT Phụ": 2,
    "BS GM": 3,
    "KTV GM": 4,
    "TDC": 5,
    "GV": 6
};

const DEFAULT_CONFIG: AppConfig = {
    priceConfig: DEFAULT_PRICE_CONFIG,
    timeRules: DEFAULT_TIME_RULES,
    roleOrder: DEFAULT_ROLE_ORDER,
    ignoredMachineCodes: []
};

// --- Context ---
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('appConfig');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                // Deep merge logic to ensure priceConfig defaults are preserved
                setConfig(prev => {
                    const merged = { ...prev, ...parsed };

                    // Specific deep merge for priceConfig to avoid losing keys
                    if (parsed.priceConfig) {
                        merged.priceConfig = { ...DEFAULT_PRICE_CONFIG };
                        Object.keys(parsed.priceConfig).forEach(key => {
                            // Only merge if key exists (or allow new keys)
                            // We merge the inner role object too
                            if (parsed.priceConfig[key]) {
                                merged.priceConfig[key] = {
                                    ...DEFAULT_PRICE_CONFIG[key],
                                    ...parsed.priceConfig[key]
                                };
                            }
                        });
                    }

                    // Deep merge for timeRules as well
                    if (parsed.timeRules) {
                        merged.timeRules = { ...DEFAULT_TIME_RULES };
                        Object.keys(parsed.timeRules).forEach(key => {
                            if (parsed.timeRules[key]) {
                                merged.timeRules[key] = {
                                    ...DEFAULT_TIME_RULES[key],
                                    ...parsed.timeRules[key]
                                };
                            }
                        });
                    }

                    return merged;
                });
            } catch (e) {
                console.error("Failed to parse config", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage on change (debounced slightly or just effect)
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('appConfig', JSON.stringify(config));
        }
    }, [config, isLoaded]);

    const updateConfig = (newConfig: Partial<AppConfig>) => {
        setConfig(prev => ({ ...prev, ...newConfig }));
    };

    const resetConfig = () => {
        if (confirm("Bạn có chắc muốn khôi phục cài đặt gốc?")) {
            setConfig(DEFAULT_CONFIG);
        }
    };

    return (
        <ConfigContext.Provider value={{ config, updateConfig, resetConfig }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
};
