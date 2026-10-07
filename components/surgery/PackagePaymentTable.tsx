/**
 * PackagePaymentTable — Bảng thanh toán gói dịch vụ
 * - Chi tiết: header 2 tầng (tên gói > vị trí)
 * - Tổng hợp: mỗi gói 1 cột tổng
 * Mode: Số lượng / Số tiền. Tìm kiếm, chế độ xem và ẩn/hiện cột do thanh công cụ chung điều khiển.
 */
import React, { useMemo } from 'react';
import {
  PositionCatalogItem,
  ServicePackageAssignment,
  ServicePackageDefinition,
  formatDeductionValue,
} from '../../types/servicePackage';
import { StaffMember } from '../../types';
import {
  PackageViewMode,
  PaymentCell,
  buildPackagePaymentRows,
  filterPackageRows,
  getUsedPackages,
  packageColumnKey,
} from '../../services/packagePaymentRows';

type DisplayMode = 'count' | 'amount';

interface Props {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  staffList: StaffMember[];
  positionCatalog?: PositionCatalogItem[];
  departments?: string[];
  mode?: DisplayMode;
  searchTerm?: string;
  viewMode?: PackageViewMode;
  hiddenCols?: string[];
  isProcessing?: boolean;
}

function formatVND(n: number): string {
  return n.toLocaleString('vi-VN');
}

export const PackagePaymentTable: React.FC<Props> = ({
  assignments,
  packages,
  staffList,
  positionCatalog = [],
  departments = [],
  mode = 'count',
  searchTerm = '',
  viewMode = 'detail',
  hiddenCols = [],
  isProcessing = false,
}) => {
  const isHidden = (key: string) => hiddenCols.includes(key);
  const summary = viewMode === 'summary';

  // Column structure: visible packages × positions
  const columnStructure = useMemo(
    () =>
      getUsedPackages(assignments, packages)
        .filter(pkg => !hiddenCols.includes(packageColumnKey(pkg.id)))
        .map(pkg => ({
          packageId: pkg.id,
          packageName: pkg.name,
          positions: pkg.positions.map(pos => ({
            positionKey: pos.positionKey,
            positionLabel: pos.positionLabel,
            amount: pos.amount,
          })),
        })),
    [assignments, packages, hiddenCols],
  );

  // Staff rows + "virtual staff" rows for positions not yet assigned to anyone
  const allRows = useMemo(
    () => buildPackagePaymentRows(assignments, packages, staffList, positionCatalog, departments),
    [assignments, packages, staffList, positionCatalog, departments],
  );
  const rows = useMemo(() => filterPackageRows(allRows, searchTerm, packages), [allRows, searchTerm, packages]);

  // Packages in use that carry an extra deduction (explained under the table)
  const deductionNotes = useMemo(
    () => getUsedPackages(assignments, packages).filter(p => p.deduction && p.deduction.value > 0),
    [assignments, packages],
  );

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);
  const grandCount = useMemo(() => rows.reduce((s, r) => s + r.totalCount, 0), [rows]);

  const packageValue = (row: (typeof rows)[number], packageId: string): number => {
    const cells = row.cells[packageId];
    if (!cells) return 0;
    return (Object.values(cells) as PaymentCell[]).reduce((s, c) => s + (mode === 'count' ? c.count : c.amount), 0);
  };

  const fixedBefore = ['department', 'taxId', 'staffName'].filter(k => !isHidden(k)).length;
  const fixedAfter = ['totalCount', 'total'].filter(k => !isHidden(k)).length;
  const dataCols = columnStructure.reduce((s, c) => s + (summary ? 1 : c.positions.length), 0);
  const headerRowSpan = summary ? 1 : 2;

  if (assignments.length === 0) {
    if (isProcessing) {
      return (
        <div className="py-12 flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-gray-200 shadow-2xs">
          <div className="h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-gray-500 font-medium">Đang tải và đồng bộ bảng thanh toán gói dịch vụ...</span>
        </div>
      );
    }
    return (
      <div className="text-center py-10 text-gray-400 text-sm italic">
        Chưa có gói dịch vụ nào được gán trong kỳ này.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm" id="package-payment-print-area">
        <table className="w-full text-xs text-left whitespace-nowrap">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th rowSpan={headerRowSpan} className="px-3 py-2 w-10 text-center border-r border-slate-200 font-semibold text-gray-500">#</th>
              {!isHidden('department') && <th rowSpan={headerRowSpan} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-600">Khoa</th>}
              {!isHidden('taxId') && <th rowSpan={headerRowSpan} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-500 w-28">MST</th>}
              {!isHidden('staffName') && <th rowSpan={headerRowSpan} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-800">Họ tên</th>}
              {columnStructure.map(col => (
                <th
                  key={col.packageId}
                  colSpan={summary ? 1 : col.positions.length}
                  rowSpan={summary ? 1 : 1}
                  className="px-2 py-2 text-center border-r border-slate-200 font-bold text-teal-800 bg-teal-50"
                >
                  {col.packageName}
                </th>
              ))}
              {!isHidden('totalCount') && <th rowSpan={headerRowSpan} className="px-3 py-2 text-center border-r border-slate-200 font-semibold text-gray-600 w-16">Tổng SL</th>}
              {!isHidden('total') && <th rowSpan={headerRowSpan} className="px-3 py-2 text-right font-bold text-emerald-700 w-28">Thành tiền</th>}
            </tr>
            {!summary && (
              <tr className="bg-gray-50 border-b border-gray-200">
                {columnStructure.flatMap(col => col.positions.map(pos => (
                  <th key={`${col.packageId}-${pos.positionKey}`} className="px-2 py-1.5 text-center border-r border-gray-200 font-semibold text-gray-500 text-[10px]">
                    {pos.positionLabel}
                  </th>
                )))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + fixedBefore + dataCols + fixedAfter} className="px-4 py-8 text-center text-gray-400 italic">
                  Không tìm thấy kết quả phù hợp.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const unassigned = row.isUnassigned;
              return (
                <tr
                  key={`${unassigned ? 'u' : 's'}-${row.staffName}`}
                  className={unassigned ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-gray-50/50'}
                  title={unassigned ? 'Vị trí chưa gán nhân viên' : undefined}
                >
                  <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-100">{idx + 1}</td>
                  {!isHidden('department') && <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{row.department || '—'}</td>}
                  {!isHidden('taxId') && <td className="px-3 py-2 font-mono text-gray-500 border-r border-gray-100">{row.taxId || '—'}</td>}
                  {!isHidden('staffName') && (
                    <td className={`px-3 py-2 border-r border-gray-100 ${unassigned ? 'italic font-medium text-amber-800' : 'font-semibold text-gray-800'}`}>{row.staffName}</td>
                  )}
                  {summary
                    ? columnStructure.map(col => {
                        const val = packageValue(row, col.packageId);
                        return (
                          <td key={col.packageId} className="px-2 py-2 text-center border-r border-gray-100 font-mono">
                            {val > 0 ? (mode === 'count' ? val : formatVND(val)) : ''}
                          </td>
                        );
                      })
                    : columnStructure.flatMap(col => col.positions.map(pos => {
                        const cell = row.cells[col.packageId]?.[pos.positionKey];
                        const val = cell ? (mode === 'count' ? cell.count : cell.amount) : 0;
                        return (
                          <td key={`${col.packageId}-${pos.positionKey}`} className="px-2 py-2 text-center border-r border-gray-100 font-mono">
                            {val > 0 ? (mode === 'count' ? val : formatVND(val)) : ''}
                          </td>
                        );
                      }))}
                  {!isHidden('totalCount') && <td className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-100">{row.totalCount}</td>}
                  {!isHidden('total') && <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{formatVND(row.total)}</td>}
                </tr>
              );
            })}
            {/* Grand total row */}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
              <td colSpan={1 + fixedBefore + dataCols} className="px-3 py-2.5 text-right text-gray-700 border-r border-slate-200">TỔNG CỘNG</td>
              {!isHidden('totalCount') && <td className="px-3 py-2.5 text-center text-gray-700 border-r border-slate-200">{grandCount}</td>}
              {!isHidden('total') && <td className="px-3 py-2.5 text-right font-mono text-emerald-800 text-sm">{formatVND(grandTotal)}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {deductionNotes.length > 0 && (
        <div className="text-[11px] text-gray-500 space-y-0.5 px-1">
          {deductionNotes.map(p => (
            <div key={p.id}>
              <span className="font-semibold text-gray-600">{p.shortName || p.name}</span>: thực lĩnh đã trừ khấu trừ {formatDeductionValue(p.deduction)}/vị trí
              {p.deduction?.note ? ` — ${p.deduction.note}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
