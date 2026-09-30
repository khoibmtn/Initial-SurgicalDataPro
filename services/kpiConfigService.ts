// ─── KPI Config Service ────────────────────────────────────────────────────────
// Quản lý cấu hình chỉ số phòng mổ (OR KPI Config) trên Firebase RTDB & LocalStorage

import { ref, get, set, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { KpiConfig, DEFAULT_KPI_CONFIG } from '../types/kpi';

const KPI_CONFIG_PATH = 'kpi_config';
const LOCAL_STORAGE_KEY = 'surgical_kpi_config';

/**
 * Lấy cấu hình KPI lưu trữ cục bộ (synchronous fallback)
 */
export function getLocalKpiConfig(): KpiConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_KPI_CONFIG, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_KPI_CONFIG };
}

/**
 * Tải cấu hình KPI từ Firebase RTDB
 */
export async function fetchKpiConfig(): Promise<KpiConfig> {
  try {
    const configRef = ref(db, KPI_CONFIG_PATH);
    const snapshot = await get(configRef);
    const data = snapshot.val();
    if (data && typeof data === 'object') {
      const merged: KpiConfig = { ...DEFAULT_KPI_CONFIG, ...data };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('[kpiConfigService] Error fetching kpi_config from Firebase:', err);
  }
  return getLocalKpiConfig();
}

/**
 * Lưu cấu hình KPI lên Firebase RTDB & LocalStorage
 */
export async function saveKpiConfig(config: KpiConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanConfig: KpiConfig = {
      standardHoursPerDay: Math.max(1, Number(config.standardHoursPerDay) || 8),
      operatingDaysPerMonth: Math.max(1, Number(config.operatingDaysPerMonth) || 22),
      targetTurnaroundMinutes: Math.max(5, Number(config.targetTurnaroundMinutes) || 25),
      warningTurnaroundMinutes: Math.max(10, Number(config.warningTurnaroundMinutes) || 40),
      minOutlierMinutes: Math.max(1, Number(config.minOutlierMinutes) || 15),
      maxOutlierMinutes: Math.max(60, Number(config.maxOutlierMinutes) || 360),
      costOverrunThresholdPct: Math.max(10, Number(config.costOverrunThresholdPct) || 100),
    };

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleanConfig));

    const configRef = ref(db, KPI_CONFIG_PATH);
    await set(configRef, cleanConfig);

    return { success: true };
  } catch (err: any) {
    console.error('[kpiConfigService] Failed to save kpi_config:', err);
    return { success: false, error: err.message || 'Lỗi khi lưu cấu hình' };
  }
}

/**
 * Lắng nghe realtime các thay đổi của cấu hình KPI
 */
export function subscribeToKpiConfig(callback: (config: KpiConfig) => void): () => void {
  // Bắn giá trị local trước để render tức thì
  callback(getLocalKpiConfig());

  const configRef = ref(db, KPI_CONFIG_PATH);
  const unsub = onValue(
    configRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        const merged: KpiConfig = { ...DEFAULT_KPI_CONFIG, ...data };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        callback(merged);
      }
    },
    (err) => {
      console.warn('[kpiConfigService] subscribe error:', err);
    }
  );

  return () => unsub();
}
