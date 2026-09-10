import { useState, useRef, useCallback } from 'react';
import { TabKey } from '../components/ui';
import { SurgeryConfig, ProcessedStats } from '../types';
import { ReportState } from '../types/reportState';
import { ColumnDef } from '../components/common/DynamicTable';
import { buildPrintConfig } from '../components/surgery/printConfigBuilder';
import { ToastType } from '../components/common/ToastContainer';

export interface UsePrintControllerOptions {
  activeTab: TabKey;
  currentReport: ReportState;
  columnsList: ColumnDef<any>[];
  visibleCols: Record<string, any>;
  derivedStats: ProcessedStats;
  ptCount: number;
  ttCount: number;
  paymentDataPrepared: any;
  getPaymentColumns: () => ColumnDef<any>[];
  config: SurgeryConfig;
  ensureDataSaved: (afterSave?: () => void) => Promise<void>;
  addToast: (message: React.ReactNode, type?: ToastType, duration?: number) => void;
}

export function usePrintController({
  activeTab,
  currentReport,
  columnsList,
  visibleCols,
  derivedStats,
  ptCount,
  ttCount,
  paymentDataPrepared,
  getPaymentColumns,
  config,
  ensureDataSaved,
  addToast,
}: UsePrintControllerOptions) {
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<any>(null);
  const overtimePrintHandlerRef = useRef<(() => void) | null>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape');

  const executePrintLogic = useCallback(
    (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => {
      const configObj = buildPrintConfig({
        type,
        reportTab: activeTab as 'daily' | 'monthly',
        dateRangeText: currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '',
        validRecords: currentReport.result?.validRecords || [],
        columnsList,
        listVisibleCols: visibleCols['list'],
        paymentVisibleCols: visibleCols['payment'],
        derivedStats,
        ptCount,
        ttCount,
        paymentDataPrepared,
        paymentCols: getPaymentColumns(),
        config,
      });

      if (configObj) {
        setPrintConfig(configObj);
        setIsPrintOpen(true);
      } else {
        addToast("Vui lòng chọn 'Danh sách PT' hoặc 'Bảng kê thanh toán' để in.", 'error');
      }
    },
    [
      activeTab,
      currentReport.result?.dateRangeText,
      currentReport.result?.validRecords,
      currentReport.queryDateRangeText,
      columnsList,
      visibleCols,
      derivedStats,
      ptCount,
      ttCount,
      paymentDataPrepared,
      getPaymentColumns,
      config,
      addToast,
    ]
  );

  const handlePrintClick = useCallback(
    async (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => {
      setPrintOrientation(orientation);

      // Tự động lưu dữ liệu trước khi in nếu dữ liệu lấy từ EXCEL
      if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
        await ensureDataSaved(() => {
          executePrintLogic(type, orientation);
        });
        return;
      }

      // Non-EXCEL source or no data: proceed directly
      executePrintLogic(type, orientation);
    },
    [currentReport.dataSource, currentReport.result?.validRecords, ensureDataSaved, executePrintLogic]
  );

  return {
    isPrintOpen,
    setIsPrintOpen,
    printConfig,
    setPrintConfig,
    overtimePrintHandlerRef,
    printOrientation,
    setPrintOrientation,
    handlePrintClick,
    executePrintLogic,
  };
}
