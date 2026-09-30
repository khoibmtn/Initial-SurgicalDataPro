/**
 * PackagePaymentTable — Bảng thanh toán gói dịch vụ
 * Header 2 tầng: tên gói (colspan) > vị trí
 * Mode: Số lượng / Số tiền
 */
import React, { useState, useMemo } from 'react';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
} from '../../types/servicePackage';
import { StaffMember } from '../../types';

interface Props {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  staffList: StaffMember[];
  mode?: DisplayMode;
  onModeChange?: (mode: DisplayMode) => void;
  onPrint?: (orientation: 'portrait' | 'landscape') => void;
}

type DisplayMode = 'count' | 'amount';

function formatVND(n: number): string {
  return n.toLocaleString('vi-VN');
}

interface StaffRow {
  staffName: string;
  department: string;
  taxId: string;
  /** cells[packageId][positionKey] = { count, amount } */
  cells: Record<string, Record<string, { count: number; amount: number }>>;
  total: number;
}

export const PackagePaymentTable: React.FC<Props> = ({
  assignments, packages, staffList, mode: propMode, onModeChange, onPrint,
}) => {
  const [internalMode, setInternalMode] = useState<DisplayMode>(() => {
    try {
      return (localStorage.getItem('package_payment_mode') as DisplayMode) || 'count';
    } catch {
      return 'count';
    }
  });

  const mode = propMode !== undefined ? propMode : internalMode;

  const handleSetMode = (newMode: DisplayMode) => {
    setInternalMode(newMode);
    try {
      localStorage.setItem('package_payment_mode', newMode);
    } catch {}
    if (onModeChange) onModeChange(newMode);
  };

  // Build column structure: unique packages × positions
  const columnStructure = useMemo(() => {
    const usedPkgIds = new Set(assignments.map(a => a.packageId));
    const pkgs = packages.filter(p => usedPkgIds.has(p.id));
    return pkgs.map(pkg => ({
      packageId: pkg.id,
      packageName: pkg.name,
      positions: pkg.positions.map(pos => ({
        positionKey: pos.positionKey,
        positionLabel: pos.positionLabel,
        amount: pos.amount,
      })),
    }));
  }, [assignments, packages]);

  // Build rows grouped by staffName
  const rows = useMemo(() => {
    const staffMap = new Map<string, StaffRow>();

    for (const a of assignments) {
      for (const sa of a.staffAssignments) {
        if (!sa.staffName) continue;
        let row = staffMap.get(sa.staffName);
        if (!row) {
          const member = staffList.find(s => s.name === sa.staffName);
          row = {
            staffName: sa.staffName,
            department: member?.department || '',
            taxId: member?.taxId || '',
            cells: {},
            total: 0,
          };
          staffMap.set(sa.staffName, row);
        }
        if (!row.cells[a.packageId]) row.cells[a.packageId] = {};
        if (!row.cells[a.packageId][sa.positionKey]) {
          row.cells[a.packageId][sa.positionKey] = { count: 0, amount: 0 };
        }
        row.cells[a.packageId][sa.positionKey].count += 1;
        row.cells[a.packageId][sa.positionKey].amount += sa.amount;
        row.total += sa.amount;
      }
    }

    return Array.from(staffMap.values()).sort((a, b) => {
      if (a.department !== b.department) return a.department.localeCompare(b.department);
      return a.staffName.localeCompare(b.staffName);
    });
  }, [assignments, staffList]);

  // Grand total
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  const totalCols = columnStructure.reduce((s, c) => s + c.positions.length, 0);

  if (assignments.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm italic">
        Chưa có gói dịch vụ nào được gán trong kỳ này.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm" id="package-payment-print-area">
        <table className="w-full text-xs text-left whitespace-nowrap">
          {/* Header Level 1: Package names */}
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th rowSpan={2} className="px-3 py-2 w-10 text-center border-r border-slate-200 font-semibold text-gray-500">#</th>
              <th rowSpan={2} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-600">Khoa</th>
              <th rowSpan={2} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-500 w-28">MST</th>
              <th rowSpan={2} className="px-3 py-2 border-r border-slate-200 font-semibold text-gray-800">Họ tên</th>
              {columnStructure.map(col => (
                <th key={col.packageId} colSpan={col.positions.length} className="px-2 py-2 text-center border-r border-slate-200 font-bold text-teal-800 bg-teal-50">
                  {col.packageName}
                </th>
              ))}
              <th rowSpan={2} className="px-3 py-2 text-center border-r border-slate-200 font-semibold text-gray-600 w-16">Tổng SL</th>
              <th rowSpan={2} className="px-3 py-2 text-right font-bold text-emerald-700 w-28">Thành tiền</th>
            </tr>
            {/* Header Level 2: Position labels */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {columnStructure.flatMap(col => col.positions.map(pos => (
                <th key={`${col.packageId}-${pos.positionKey}`} className="px-2 py-1.5 text-center border-r border-gray-200 font-semibold text-gray-500 text-[10px]">
                  {pos.positionLabel}
                </th>
              )))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const totalCount = Object.values(row.cells).reduce((s, pkg) =>
                s + Object.values(pkg).reduce((ss, c) => ss + c.count, 0), 0
              );
              return (
                <tr key={row.staffName} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-100">{idx + 1}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{row.department || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 border-r border-gray-100">{row.taxId || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-gray-800 border-r border-gray-100">{row.staffName}</td>
                  {columnStructure.flatMap(col => col.positions.map(pos => {
                    const cell = row.cells[col.packageId]?.[pos.positionKey];
                    const val = cell ? (mode === 'count' ? cell.count : cell.amount) : 0;
                    return (
                      <td key={`${col.packageId}-${pos.positionKey}`} className="px-2 py-2 text-center border-r border-gray-100 font-mono">
                        {val > 0 ? (mode === 'count' ? val : formatVND(val)) : ''}
                      </td>
                    );
                  }))}
                  <td className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-100">{totalCount}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{formatVND(row.total)}</td>
                </tr>
              );
            })}
            {/* Grand total row */}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
              <td colSpan={4 + totalCols} className="px-3 py-2.5 text-right text-gray-700 border-r border-slate-200">TỔNG CỘNG</td>
              <td className="px-3 py-2.5 text-center text-gray-700 border-r border-slate-200">
                {rows.reduce((s, r) => s + Object.values(r.cells).reduce((ss, pkg) => ss + Object.values(pkg).reduce((sss, c) => sss + c.count, 0), 0), 0)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-emerald-800 text-sm">{formatVND(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
