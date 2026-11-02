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
import {
  buildPackagePaymentRows,
  filterPackageRows,
  packageColumnKey,
  PackageViewMode,
  PaymentCell,
} from '../services/packagePaymentRows';
import { StaffMember } from '../types';
import type { PaymentListsContext } from './usePaymentLists';

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
  paymentLists?: PaymentListsContext;
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
  paymentLists,
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

        // Resolve active payment filter ('all' | 'unpaid' | <listId>) & search term in Monthly Report -> Gói dịch vụ
        let effectiveAssignments = packageAssignments;
        const baseDateRange = currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '';
        let effectiveDateRangeText = baseDateRange;
        let searchTerm = '';
        try {
          searchTerm = localStorage.getItem('package_payment_search') || '';
          const selectedList = localStorage.getItem('payment_list_selected') || 'all';
          if (paymentLists && selectedList === 'unpaid') {
            effectiveAssignments = packageAssignments.filter(
              (a) => !paymentLists.membershipIndex.has((a.patientId || '').trim())
            );
            effectiveDateRangeText = baseDateRange
              ? `${baseDateRange} (Chưa gán đợt: ${effectiveAssignments.length} ca)`
              : `Chưa gán đợt (${effectiveAssignments.length} ca)`;
          } else if (paymentLists && selectedList !== 'all') {
            const list = paymentLists.lists.find((l) => l.id === selectedList);
            if (list) {
              const ids = new Set(list.items.map((i) => i.patientId.trim()));
              effectiveAssignments = paymentLists.allAssignments.filter((a) =>
                ids.has((a.patientId || '').trim())
              );
              effectiveDateRangeText = `Đợt thanh toán: ${list.name} (${effectiveAssignments.length} ca)`;
            }
          }
        } catch {}

        // Build package payment print config directly
        const configObj = buildPackagePaymentPrintConfig({
          assignments: effectiveAssignments,
          packages: packageDefinitions,
          staffList,
          positionCatalog,
          dateRangeText: effectiveDateRangeText,
          orientation,
          config,
          packagePaymentMode: currentMode,
          packageModuleConfig,
          searchTerm,
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
      paymentLists,
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
  viewMode?: PackageViewMode;
  hiddenCols?: string[];
  searchTerm?: string;
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

  let viewMode: PackageViewMode = params.viewMode || 'detail';
  try {
    if (!params.viewMode) {
      const savedView = localStorage.getItem('package_payment_view');
      if (savedView === 'summary' || savedView === 'detail') {
        viewMode = savedView;
      }
    }
  } catch {}
  const isSummary = viewMode === 'summary';

  let hiddenCols: string[] = params.hiddenCols || [];
  try {
    if (!params.hiddenCols) {
      const rawHidden = JSON.parse(localStorage.getItem('package_payment_hidden_cols') || '[]');
      if (Array.isArray(rawHidden)) hiddenCols = rawHidden;
    }
  } catch {}
  const isHidden = (key: string) => hiddenCols.includes(key);

  let searchTerm = params.searchTerm ?? '';
  try {
    if (params.searchTerm === undefined) {
      searchTerm = localStorage.getItem('package_payment_search') || '';
    }
  } catch {}

  // Build column structure: unique packages × positions (filtered by hiddenCols)
  const usedPkgIds = new Set(assignments.map(a => a.packageId));
  const pkgs = packages
    .filter(p => usedPkgIds.has(p.id))
    .filter(p => !isHidden(packageColumnKey(p.id)));
  const columnStructure = pkgs.map(pkg => ({
    packageId: pkg.id,
    packageName: pkg.name,
    positions: pkg.positions.map(pos => ({
      positionKey: pos.positionKey,
      positionLabel: pos.positionLabel,
      amount: pos.amount,
    })),
  }));

  // Staff rows + "virtual staff" rows for positions not yet assigned to anyone, filtered by searchTerm
  const allRows = buildPackagePaymentRows(
    assignments,
    packages,
    staffList,
    params.positionCatalog || [],
    params.config?.departments || []
  );
  const rows = filterPackageRows(allRows, searchTerm, packages).map((r, i) => ({ ...r, stt: i + 1 }));

  const totalDynamicCols = isSummary
    ? columnStructure.length
    : columnStructure.reduce((s, c) => s + c.positions.length, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandCount = rows.reduce((s, r) => s + r.totalCount, 0);

  // Build flat columns for print
  const columns: {
    key: string;
    label: string;
    align: 'left' | 'center' | 'right';
    width?: string;
    className?: string;
  }[] = [
    { key: 'stt', label: '#', align: 'center', width: '24px' },
  ];
  if (!isHidden('department')) {
    columns.push({ key: 'department', label: 'Khoa', align: 'left' });
  }
  if (!isHidden('taxId')) {
    columns.push({ key: 'taxId', label: 'MST', align: 'center' });
  }
  if (!isHidden('staffName')) {
    columns.push({ key: 'staffName', label: 'Họ tên', align: 'left' });
  }

  const fixedLeadingCount = columns.length;

  if (isSummary) {
    for (const pkg of columnStructure) {
      columns.push({
        key: `pkg_${pkg.packageId}`,
        label: pkg.packageName,
        align: isAmount ? 'right' : 'center',
        className: 'col-numeric',
      });
    }
  } else {
    for (const pkg of columnStructure) {
      for (const pos of pkg.positions) {
        columns.push({
          key: `${pkg.packageId}_${pos.positionKey}`,
          label: pos.positionLabel,
          align: isAmount ? 'right' : 'center',
          className: 'col-numeric',
        });
      }
    }
  }

  if (!isHidden('totalCount')) {
    columns.push({ key: 'totalCount', label: 'Tổng SL', align: 'center', className: 'col-numeric font-bold' });
  }
  if (!isHidden('total')) {
    columns.push({ key: 'total', label: 'Thành tiền', align: 'right', className: 'col-total' });
  }

  const totalTableCols = columns.length;

  // Build data rows
  let prevDept = '';
  const data = rows.map((r, rIdx) => {
    const currDept = r.isUnassigned ? '__UNASSIGNED__' : (r.department || '');
    const isNewDept = rIdx > 0 && currDept !== prevDept;
    prevDept = currDept;

    const row: Record<string, any> = {
      stt: r.stt,
      department: r.department,
      taxId: r.taxId,
      staffName: r.staffName,
      totalCount: r.totalCount,
      total: r.total.toLocaleString('vi-VN'),
      isNewDept,
    };
    if (isSummary) {
      for (const pkg of columnStructure) {
        const pkgCells = r.cells[pkg.packageId];
        const sumVal = pkgCells
          ? (Object.values(pkgCells) as PaymentCell[]).reduce(
              (s, c) => s + (isAmount ? c.amount : c.count),
              0
            )
          : 0;
        row[`pkg_${pkg.packageId}`] =
          sumVal > 0 ? (isAmount ? sumVal.toLocaleString('vi-VN') : sumVal) : '';
      }
    } else {
      for (const pkg of columnStructure) {
        for (const pos of pkg.positions) {
          const cell = r.cells[pkg.packageId]?.[pos.positionKey];
          if (isAmount) {
            row[`${pkg.packageId}_${pos.positionKey}`] =
              cell && cell.amount > 0 ? cell.amount.toLocaleString('vi-VN') : '';
          } else {
            row[`${pkg.packageId}_${pos.positionKey}`] =
              cell && cell.count > 0 ? cell.count : '';
          }
        }
      }
    }
    return row;
  });

  const headerRowSpan = isSummary ? 1 : 2;
  const fixedHeaderCells = [
    React.createElement('th', {
      key: 'stt',
      rowSpan: headerRowSpan,
      className: 'px-0.5 py-0.5 border border-black w-[24px] text-center font-bold text-[9px] align-middle',
    }, '#'),
    ...(!isHidden('department')
      ? [
          React.createElement('th', {
            key: 'dept',
            rowSpan: headerRowSpan,
            className: 'px-1 py-0.5 border border-black font-bold text-center text-[9px] align-middle',
          }, 'Khoa'),
        ]
      : []),
    ...(!isHidden('taxId')
      ? [
          React.createElement('th', {
            key: 'tax',
            rowSpan: headerRowSpan,
            className: 'px-1 py-0.5 border border-black font-bold text-center text-[9px] align-middle',
          }, 'MST'),
        ]
      : []),
    ...(!isHidden('staffName')
      ? [
          React.createElement('th', {
            key: 'name',
            rowSpan: headerRowSpan,
            className: 'px-1 py-0.5 border border-black font-bold text-center text-[10px] align-middle',
          }, 'Họ tên'),
        ]
      : []),
  ];

  const trailingHeaderCells = [
    ...(!isHidden('totalCount')
      ? [
          React.createElement('th', {
            key: 'tc',
            rowSpan: headerRowSpan,
            className: 'px-1 py-0.5 border border-black font-bold text-center text-[9px] align-middle whitespace-normal leading-tight',
          }, 'Tổng SL'),
        ]
      : []),
    ...(!isHidden('total')
      ? [
          React.createElement('th', {
            key: 'total',
            rowSpan: headerRowSpan,
            className: 'px-1 py-0.5 border border-black font-bold text-center text-[9px] align-middle whitespace-normal leading-tight',
          }, 'Thành tiền'),
        ]
      : []),
  ];

  // Custom thead with 2-tier header (or 1-tier in summary mode)
  const customThead = React.createElement('thead', {
    className: 'text-xs text-black border-b border-black',
  }, [
    React.createElement('tr', { key: 'h1', className: 'border-b border-black' }, [
      ...fixedHeaderCells,
      ...columnStructure.map(pkg =>
        React.createElement('th', {
          key: pkg.packageId,
          colSpan: isSummary ? 1 : pkg.positions.length,
          className: 'px-0.5 py-0.5 border border-black font-bold text-center text-[8.5px] align-middle whitespace-normal break-words leading-tight',
        }, pkg.packageName)
      ),
      ...trailingHeaderCells,
    ]),
    ...(!isSummary
      ? [
          React.createElement('tr', { key: 'h2', className: 'border-b border-black' },
            columnStructure.flatMap(pkg =>
              pkg.positions.map(pos =>
                React.createElement('th', {
                  key: `${pkg.packageId}_${pos.positionKey}`,
                  className: 'px-0.5 py-0.5 border border-black font-semibold text-center text-[7.5px] align-middle whitespace-normal break-words leading-tight',
                }, pos.positionLabel)
              )
            )
          ),
        ]
      : []),
  ]);

  // Footer row with totals
  const dynamicFooterCells = isSummary
    ? columnStructure.map(pkg => {
        const colSum = rows.reduce((s, r) => {
          const pkgCells = r.cells[pkg.packageId];
          if (!pkgCells) return s;
          return (
            s +
            (Object.values(pkgCells) as PaymentCell[]).reduce(
              (acc, c) => acc + (isAmount ? c.amount : c.count),
              0
            )
          );
        }, 0);
        return React.createElement(
          'td',
          {
            key: `pkg_${pkg.packageId}`,
            className: `px-0.5 py-0.5 border border-black ${
              isAmount ? 'text-right' : 'text-center'
            } font-bold text-[8.5px] col-numeric`,
          },
          colSum ? (isAmount ? colSum.toLocaleString('vi-VN') : colSum) : ''
        );
      })
    : columnStructure.flatMap(pkg =>
        pkg.positions.map(pos => {
          if (isAmount) {
            const colAmount = rows.reduce(
              (s, r) => s + (r.cells[pkg.packageId]?.[pos.positionKey]?.amount || 0),
              0
            );
            return React.createElement(
              'td',
              {
                key: `${pkg.packageId}_${pos.positionKey}`,
                className: 'px-0.5 py-0.5 border border-black text-right font-bold text-[8px] col-numeric',
              },
              colAmount ? colAmount.toLocaleString('vi-VN') : ''
            );
          } else {
            const colTotal = rows.reduce(
              (s, r) => s + (r.cells[pkg.packageId]?.[pos.positionKey]?.count || 0),
              0
            );
            return React.createElement(
              'td',
              {
                key: `${pkg.packageId}_${pos.positionKey}`,
                className: 'px-0.5 py-0.5 border border-black text-center font-bold text-[8.5px] col-numeric',
              },
              colTotal || ''
            );
          }
        })
      );

  const totalFooterRow = React.createElement('tr', { key: 'totals', className: 'font-bold border-t-2 border-black' }, [
    React.createElement('td', {
      key: 'span',
      colSpan: fixedLeadingCount,
      className: 'px-1 py-0.5 border border-black text-center font-bold text-[9.5px]',
    }, 'TỔNG CỘNG'),
    ...dynamicFooterCells,
    ...(!isHidden('totalCount')
      ? [
          React.createElement('td', {
            key: 'tc',
            className: 'px-0.5 py-0.5 border border-black text-center font-bold text-[9.5px] col-numeric',
          }, grandCount),
        ]
      : []),
    ...(!isHidden('total')
      ? [
          React.createElement('td', {
            key: 'total',
            className: 'px-0.5 py-0.5 border border-black text-right font-bold text-[9.5px] col-total',
          }, grandTotal.toLocaleString('vi-VN')),
        ]
      : []),
  ]);

  const deductionPkgs = columnStructure
    .map(c => packages.find(p => p.id === c.packageId))
    .filter((p): p is ServicePackageDefinition => !!p && !!p.deduction && p.deduction.value > 0);

  const deductionNoteRows = deductionPkgs.map(p =>
    React.createElement('tr', { key: `ded-${p.id}` }, [
      React.createElement('td', {
        key: 'note',
        colSpan: Math.max(totalTableCols, 1),
        className: 'px-1 py-0.5 border border-black text-left text-[8.5px] italic whitespace-normal',
      }, `${p.shortName || p.name}: thực lĩnh đã trừ khấu trừ ${formatDeductionValue(p.deduction)}/vị trí${p.deduction?.note ? ` — ${p.deduction.note}` : ''}`),
    ])
  );

  const extraFooterRow = React.createElement(React.Fragment, null, [totalFooterRow, ...deductionNoteRows]);
  const printTitle = params.packageModuleConfig?.printTitle || DEFAULT_MODULE_CONFIG.printTitle || 'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU';

  let signatureDate: Date | undefined;
  const endMatch = (dateRangeText || '').match(/đến ngày (\d{2})\/(\d{2})\/(\d{4})/);
  if (endMatch) {
    const d = new Date(parseInt(endMatch[3]), parseInt(endMatch[2]) - 1, parseInt(endMatch[1]));
    d.setDate(d.getDate() + 1);
    signatureDate = d;
  }

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
      className: c.className,
      render: undefined,
    })),
    customThead,
    extraFooterRow,
    orientation,
    signatureDate,
    totalDynamicCols,
  };
}
