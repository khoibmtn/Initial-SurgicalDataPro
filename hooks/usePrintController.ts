import React, { useState, useRef, useCallback } from 'react';
import { TabKey } from '../components/ui';
import { SurgeryConfig, ProcessedStats } from '../types';
import { ReportState } from '../types/reportState';
import { ColumnDef } from '../components/common/DynamicTable';
import { buildPrintConfig } from '../components/surgery/printConfigBuilder';
import { ToastType } from '../components/common/ToastContainer';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  ServicePackageModuleConfig,
  PositionCatalogItem,
  DEFAULT_MODULE_CONFIG,
  formatDeductionValue,
} from '../types/servicePackage';
import { buildPackagePaymentRows } from '../services/packagePaymentRows';
import { StaffMember } from '../types';

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
  // Package data for package payment print
  packageAssignments: ServicePackageAssignment[];
  packageDefinitions: ServicePackageDefinition[];
  staffList: StaffMember[];
  positionCatalog?: PositionCatalogItem[];
  packagePaymentMode?: 'count' | 'amount';
  packageModuleConfig?: ServicePackageModuleConfig;
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
  packageAssignments,
  packageDefinitions,
  staffList,
  positionCatalog,
  packagePaymentMode,
  packageModuleConfig,
}: UsePrintControllerOptions) {
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<any>(null);
  const overtimePrintHandlerRef = useRef<(() => void) | null>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape');

  const executePrintLogic = useCallback(
    (type: 'list' | 'payment' | 'packagePayment', orientation: 'portrait' | 'landscape') => {
      if (type === 'packagePayment') {
        // Read directly from localStorage to ensure 100% real-time synchronization with UI toggle
        let currentMode: 'count' | 'amount' = 'count';
        try {
          const stored = localStorage.getItem('package_payment_mode') as 'count' | 'amount';
          if (stored === 'amount' || stored === 'count') {
            currentMode = stored;
          } else if (packagePaymentMode) {
            currentMode = packagePaymentMode;
          }
        } catch {
          currentMode = packagePaymentMode || 'count';
        }

        // Build package payment print config directly
        const configObj = buildPackagePaymentPrintConfig({
          assignments: packageAssignments,
          packages: packageDefinitions,
          staffList,
          positionCatalog,
          dateRangeText: currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '',
          orientation,
          config,
          packagePaymentMode: currentMode,
          packageModuleConfig,
        });
        if (configObj) {
          setPrintConfig(configObj);
          setIsPrintOpen(true);
        } else {
          addToast('Không có dữ liệu gói dịch vụ để in.', 'error');
        }
        return;
      }

      const configObj = buildPrintConfig({
        type: type as 'list' | 'payment',
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
      packageAssignments,
      packageDefinitions,
      staffList,
      positionCatalog,
      packagePaymentMode,
      packageModuleConfig,
    ]
  );

  const handlePrintClick = useCallback(
    async (type: 'list' | 'payment' | 'packagePayment', orientation: 'portrait' | 'landscape') => {
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

// ─── Package Payment Print Config Builder ────────────────────────────────────

export interface BuildPackagePaymentParams {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  staffList: StaffMember[];
  positionCatalog?: PositionCatalogItem[];
  dateRangeText: string;
  orientation: 'portrait' | 'landscape';
  config: any;
  packagePaymentMode?: 'count' | 'amount';
  packageModuleConfig?: ServicePackageModuleConfig;
}

export function buildPackagePaymentPrintConfig(params: BuildPackagePaymentParams): any | null {
  const { assignments, packages, staffList, dateRangeText, orientation } = params;
  if (!assignments.length) return null;

  let mode: 'count' | 'amount' = 'count';
  try {
    const saved = localStorage.getItem('package_payment_mode') as 'count' | 'amount';
    if (saved === 'amount' || saved === 'count') {
      mode = saved;
    } else if (params.packagePaymentMode) {
      mode = params.packagePaymentMode;
    }
  } catch {
    mode = params.packagePaymentMode || 'count';
  }
  const isAmount = mode === 'amount';

  // Build column structure: unique packages × positions
  const usedPkgIds = new Set(assignments.map(a => a.packageId));
  const pkgs = packages.filter(p => usedPkgIds.has(p.id));
  const columnStructure = pkgs.map(pkg => ({
    packageId: pkg.id,
    packageName: pkg.name,
    positions: pkg.positions.map(pos => ({
      positionKey: pos.positionKey,
      positionLabel: pos.positionLabel,
      amount: pos.amount,
    })),
  }));

  // Staff rows + "virtual staff" rows for positions not yet assigned to anyone
  const rows = buildPackagePaymentRows(assignments, packages, staffList, params.positionCatalog || [], params.config?.departments || [])
    .map((r, i) => ({ ...r, stt: i + 1 }));

  const totalCols = columnStructure.reduce((s, c) => s + c.positions.length, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandCount = rows.reduce((s, r) => s + r.totalCount, 0);

  // Build flat columns for print
  const columns = [
    { key: 'stt', label: '#', align: 'center' as const, width: '30px' },
    { key: 'department', label: 'Khoa', align: 'left' as const },
    { key: 'taxId', label: 'MST', align: 'center' as const },
    { key: 'staffName', label: 'Họ tên', align: 'left' as const },
  ];

  for (const pkg of columnStructure) {
    for (const pos of pkg.positions) {
      columns.push({
        key: `${pkg.packageId}_${pos.positionKey}`,
        label: pos.positionLabel,
        align: isAmount ? ('right' as const) : ('center' as const),
        width: undefined as any,
      });
    }
  }
  columns.push({ key: 'totalCount', label: 'Tổng SL', align: 'center' as const, width: undefined as any });
  columns.push({ key: 'total', label: 'Thành tiền', align: 'right' as const, width: undefined as any });

  // Build data rows
  const data = rows.map(r => {
    const row: Record<string, any> = {
      stt: r.stt,
      department: r.department,
      taxId: r.taxId,
      staffName: r.staffName,
      totalCount: r.totalCount,
      total: r.total.toLocaleString('vi-VN'),
    };
    for (const pkg of columnStructure) {
      for (const pos of pkg.positions) {
        const cell = r.cells[pkg.packageId]?.[pos.positionKey];
        if (isAmount) {
          row[`${pkg.packageId}_${pos.positionKey}`] = (cell && cell.amount > 0) ? cell.amount.toLocaleString('vi-VN') : '';
        } else {
          row[`${pkg.packageId}_${pos.positionKey}`] = cell && cell.count > 0 ? cell.count : '';
        }
      }
    }
    return row;
  });

  // Custom thead with 2-tier header
  const customThead = React.createElement('thead', {
    className: 'text-xs text-black border-b border-black',
  }, [
    // Row 1: package names spanning positions
    React.createElement('tr', { key: 'h1', className: 'border-b border-black' }, [
      React.createElement('th', { key: 'stt', rowSpan: 2, className: 'px-1 py-1 border border-black w-[30px] text-center font-bold text-[10px] align-middle' }, '#'),
      React.createElement('th', { key: 'dept', rowSpan: 2, className: 'px-1 py-1 border border-black font-bold text-center text-[10px] align-middle' }, 'Khoa'),
      React.createElement('th', { key: 'tax', rowSpan: 2, className: 'px-1 py-1 border border-black font-bold text-center text-[10px] align-middle' }, 'MST'),
      React.createElement('th', { key: 'name', rowSpan: 2, className: 'px-1 py-1 border border-black font-bold text-center text-[11px] align-middle' }, 'Họ tên'),
      ...columnStructure.map(pkg =>
        React.createElement('th', {
          key: pkg.packageId,
          colSpan: pkg.positions.length,
          className: 'px-1 py-1 border border-black font-bold text-center text-[9px] align-middle',
        }, pkg.packageName)
      ),
      React.createElement('th', { key: 'tc', rowSpan: 2, className: 'px-1 py-1 border border-black font-bold text-center text-[10px] align-middle' }, 'Tổng SL'),
      React.createElement('th', { key: 'total', rowSpan: 2, className: 'px-1 py-1 border border-black font-bold text-center text-[10px] align-middle' }, 'Thành tiền'),
    ]),
    // Row 2: position labels
    React.createElement('tr', { key: 'h2', className: 'border-b border-black' },
      columnStructure.flatMap(pkg =>
        pkg.positions.map(pos =>
          React.createElement('th', {
            key: `${pkg.packageId}_${pos.positionKey}`,
            className: 'px-0.5 py-0.5 border border-black font-semibold text-center text-[8px]',
          }, pos.positionLabel)
        )
      )
    ),
  ]);

  // Footer row with totals
  const totalFooterRow = React.createElement('tr', { key: 'totals', className: 'font-bold border-t-2 border-black' }, [
    React.createElement('td', { key: 'span', colSpan: 4, className: 'px-1 py-1 border border-black text-center font-bold text-[10px]' }, 'TỔNG CỘNG'),
    ...columnStructure.flatMap(pkg =>
      pkg.positions.map(pos => {
        if (isAmount) {
          const colAmount = rows.reduce((s, r) => s + (r.cells[pkg.packageId]?.[pos.positionKey]?.amount || 0), 0);
          return React.createElement('td', {
            key: `${pkg.packageId}_${pos.positionKey}`,
            className: 'px-0.5 py-1 border border-black text-right font-bold text-[9px]',
          }, colAmount ? colAmount.toLocaleString('vi-VN') : '');
        } else {
          const colTotal = rows.reduce((s, r) => s + (r.cells[pkg.packageId]?.[pos.positionKey]?.count || 0), 0);
          return React.createElement('td', {
            key: `${pkg.packageId}_${pos.positionKey}`,
            className: 'px-0.5 py-1 border border-black text-center font-bold text-[9px]',
          }, colTotal || '');
        }
      })
    ),
    React.createElement('td', { key: 'tc', className: 'px-1 py-1 border border-black text-center font-bold text-[10px]' }, grandCount),
    React.createElement('td', { key: 'total', className: 'px-1 py-1 border border-black text-right font-bold text-[10px]' }, grandTotal.toLocaleString('vi-VN')),
  ]);

  const deductionPkgs = columnStructure
    .map(c => packages.find(p => p.id === c.packageId))
    .filter((p): p is ServicePackageDefinition => !!p && !!p.deduction && p.deduction.value > 0);

  const deductionNoteRows = deductionPkgs.map(p =>
    React.createElement('tr', { key: `ded-${p.id}` }, [
      React.createElement('td', {
        key: 'note',
        colSpan: 4 + totalCols + 2,
        className: 'px-1 py-0.5 border border-black text-left text-[9px] italic',
      }, `${p.shortName || p.name}: thực lĩnh đã trừ khấu trừ ${formatDeductionValue(p.deduction)}/vị trí${p.deduction?.note ? ` — ${p.deduction.note}` : ''}`),
    ])
  );

  const extraFooterRow = React.createElement(React.Fragment, null, [totalFooterRow, ...deductionNoteRows]);
  const printTitle = params.packageModuleConfig?.printTitle || DEFAULT_MODULE_CONFIG.printTitle || 'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU';

  return {
    type: 'payment',
    title: printTitle,
    dateRange: dateRangeText,
    data,
    columns: columns.map(c => ({
      key: c.key,
      label: c.label,
      align: c.align,
      width: c.width,
      render: undefined,
    })),
    customThead,
    extraFooterRow,
    orientation,
  };
}
