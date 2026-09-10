import { useCallback } from 'react';
import { SurgeryConfig } from '../types';
import { DEFAULT_CONFIG } from '../contexts/ConfigContext';

export interface UseReportTableSettingsOptions {
  config: SurgeryConfig;
  updateConfig: (updates: Partial<SurgeryConfig>) => void;
  currentType: 'daily' | 'monthly';
}

export function useReportTableSettings({ config, updateConfig, currentType }: UseReportTableSettingsOptions) {
  // Per-Report UI settings from Config (with fallbacks to global or defaults)
  const reportConfig = config.uiSettings?.perReport?.[currentType];
  const rowsPerPage = reportConfig?.rowsPerPage || config.uiSettings?.rowsPerPage || 20;
  const dateFormat = reportConfig?.dateFormat || config.uiSettings?.dateFormat || 'dd/mm/yyyy hh:mm';
  const visibleCols = reportConfig?.visibleColumns || config.uiSettings?.visibleColumns || {};
  const searchableCols = reportConfig?.searchableColumns || config.uiSettings?.searchableColumns || {};

  const updateRowsPerPage = useCallback(
    (n: number) => {
      const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
      updateConfig({
        uiSettings: {
          ...currentUISettings,
          perReport: {
            ...currentUISettings.perReport,
            [currentType]: {
              ...(currentUISettings.perReport?.[currentType] as any),
              rowsPerPage: n,
            },
          },
        },
      });
    },
    [config.uiSettings, currentType, updateConfig]
  );

  const updateDateFormat = useCallback(
    (f: string) => {
      const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
      updateConfig({
        uiSettings: {
          ...currentUISettings,
          perReport: {
            ...currentUISettings.perReport,
            [currentType]: {
              ...(currentUISettings.perReport?.[currentType] as any),
              dateFormat: f,
            },
          },
        },
      });
    },
    [config.uiSettings, currentType, updateConfig]
  );

  const updateVisibleCols = useCallback(
    (table: string, cols: Record<string, boolean>) => {
      const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
      const currentReportUI = currentUISettings.perReport?.[currentType] || {
        rowsPerPage,
        dateFormat,
        visibleColumns: {},
        searchableColumns: {},
      };
      updateConfig({
        uiSettings: {
          ...currentUISettings,
          perReport: {
            ...currentUISettings.perReport,
            [currentType]: {
              ...currentReportUI,
              visibleColumns: { ...(currentReportUI.visibleColumns || {}), [table]: cols },
            },
          },
        },
      });
    },
    [config.uiSettings, currentType, rowsPerPage, dateFormat, updateConfig]
  );

  const updateSearchableCols = useCallback(
    (table: string, cols: Record<string, boolean>) => {
      const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
      const currentReportUI = currentUISettings.perReport?.[currentType] || {
        rowsPerPage,
        dateFormat,
        visibleColumns: {},
        searchableColumns: {},
      };
      updateConfig({
        uiSettings: {
          ...currentUISettings,
          perReport: {
            ...currentUISettings.perReport,
            [currentType]: {
              ...currentReportUI,
              searchableColumns: { ...(currentReportUI.searchableColumns || {}), [table]: cols },
            },
          },
        },
      });
    },
    [config.uiSettings, currentType, rowsPerPage, dateFormat, updateConfig]
  );

  return {
    rowsPerPage,
    dateFormat,
    visibleCols,
    searchableCols,
    updateRowsPerPage,
    updateDateFormat,
    updateVisibleCols,
    updateSearchableCols,
  };
}
