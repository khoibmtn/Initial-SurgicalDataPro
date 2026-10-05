/**
 * Package payment rows — gom dữ liệu bảng thanh toán gói dịch vụ.
 *
 * Mỗi nhân viên là 1 dòng. Vị trí trong gói chưa gán nhân viên được gom thành
 * "nhân viên ảo" (1 dòng cho mỗi vị trí), đặt cuối bảng. Số tiền luôn là số tiền
 * thực lĩnh (đã trừ khấu trừ thêm theo cấu hình gói hiện tại).
 */
import { StaffMember } from '../types';
import {
  PositionCatalogItem,
  ServicePackageAssignment,
  ServicePackageDefinition,
  calcNetPositionAmount,
  findPackageForAssignment,
} from '../types/servicePackage';

export interface PaymentCell {
  count: number;
  amount: number;
}

export interface PackagePaymentRow {
  staffName: string;
  department: string;
  taxId: string;
  /** cells[packageId][positionKey] */
  cells: Record<string, Record<string, PaymentCell>>;
  total: number;
  totalCount: number;
  /** true = dòng "nhân viên ảo" đại diện cho vị trí chưa gán nhân viên */
  isUnassigned: boolean;
}

function addToCell(row: PackagePaymentRow, packageId: string, positionKey: string, amount: number): void {
  const pkgCells = row.cells[packageId] || (row.cells[packageId] = {});
  const cell = pkgCells[positionKey] || (pkgCells[positionKey] = { count: 0, amount: 0 });
  cell.count += 1;
  cell.amount += amount;
  row.total += amount;
  row.totalCount += 1;
}

export type PackageViewMode = 'summary' | 'detail';

/** Các cột cố định có thể ẩn/hiện (cột gói dùng key `pkg:<id>`). */
export const PACKAGE_FIXED_COLUMNS = [
  { key: 'department', label: 'Khoa' },
  { key: 'taxId', label: 'MST' },
  { key: 'staffName', label: 'Họ tên' },
  { key: 'totalCount', label: 'Tổng SL' },
  { key: 'total', label: 'Thành tiền' },
] as const;

export const packageColumnKey = (packageId: string) => `pkg:${packageId}`;

/** Tìm theo khoa, MST, họ tên/vị trí và tên các gói mà dòng có phát sinh. */
export function filterPackageRows(
  rows: PackagePaymentRow[],
  searchTerm: string,
  packages: ServicePackageDefinition[],
): PackagePaymentRow[] {
  const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter(row => {
    const pkgText = Object.keys(row.cells)
      .map(id => {
        const p = packages.find(x => x.id === id);
        return `${p?.name || ''} ${p?.shortName || ''}`;
      })
      .join(' ');
    const text = `${row.department} ${row.taxId} ${row.staffName} ${pkgText}`.toLowerCase();
    return terms.every(t => text.includes(t));
  });
}


/** Packages that have at least one assignment, in definition order. */
export function getUsedPackages(
  assignments: ServicePackageAssignment[],
  packages: ServicePackageDefinition[],
): ServicePackageDefinition[] {
  const used = new Set(assignments.map(a => a.packageId));
  return packages.filter(p => used.has(p.id));
}

// Cùng trọng số với bảng thanh toán PTTT (reprocess.ts)
const STAFF_POSITION_WEIGHTS: Record<string, number> = { 'BS PT': 1, 'BS GMHS': 2, 'Phụ': 3 };

export function buildPackagePaymentRows(
  assignments: ServicePackageAssignment[],
  packages: ServicePackageDefinition[],
  staffList: StaffMember[],
  positionCatalog: PositionCatalogItem[] = [],
  departmentOrder: string[] = [],
): PackagePaymentRow[] {
  const deptWeight = new Map<string, number>();
  departmentOrder.forEach((d, i) => deptWeight.set(d, i));
  const bestPositionOrder = new Map<string, number>(); // staffName -> min catalog sortOrder
  const staffRows = new Map<string, PackagePaymentRow>();
  const unassignedRows = new Map<string, PackagePaymentRow>(); // key = positionKey
  const unassignedOrder = new Map<string, number>();

  const getUnassignedRow = (positionKey: string, fallbackLabel: string): PackagePaymentRow => {
    let row = unassignedRows.get(positionKey);
    if (!row) {
      const cat = positionCatalog.find(p => p.key === positionKey);
      row = {
        staffName: cat?.label || fallbackLabel,
        department: '',
        taxId: '',
        cells: {},
        total: 0,
        totalCount: 0,
        isUnassigned: true,
      };
      unassignedRows.set(positionKey, row);
      unassignedOrder.set(positionKey, cat?.sortOrder ?? 999);
    }
    return row;
  };

  for (const a of assignments) {
    const pkgDef = findPackageForAssignment(a, packages);
    const deduction = pkgDef?.deduction;

    for (const sa of a.staffAssignments) {
      const name = (sa.staffName || '').trim();
      if (!name) continue;
      let row = staffRows.get(name);
      if (!row) {
        const member = staffList.find(s => s.name === name);
        row = {
          staffName: name,
          department: member?.department || '',
          taxId: member?.taxId || '',
          cells: {},
          total: 0,
          totalCount: 0,
          isUnassigned: false,
        };
        staffRows.set(name, row);
      }
      addToCell(row, a.packageId, sa.positionKey, calcNetPositionAmount(sa.amount, deduction));
      const order = positionCatalog.find(p => p.key === sa.positionKey)?.sortOrder ?? 999;
      if (order < (bestPositionOrder.get(name) ?? Infinity)) bestPositionOrder.set(name, order);
    }

    // Vị trí của gói chưa có nhân viên (không có bản ghi, hoặc bản ghi để trống)
    const assignedKeys = new Set(
      a.staffAssignments.filter(sa => (sa.staffName || '').trim()).map(sa => sa.positionKey),
    );
    const candidates = new Map<string, { label: string; amount: number }>();
    for (const pos of pkgDef?.positions || []) {
      const saved = a.staffAssignments.find(sa => sa.positionKey === pos.positionKey);
      candidates.set(pos.positionKey, { label: pos.positionLabel, amount: saved?.amount ?? pos.amount });
    }
    for (const sa of a.staffAssignments) {
      if (!candidates.has(sa.positionKey)) {
        candidates.set(sa.positionKey, { label: sa.positionLabel, amount: sa.amount });
      }
    }
    candidates.forEach((info, positionKey) => {
      if (assignedKeys.has(positionKey)) return;
      addToCell(
        getUnassignedRow(positionKey, info.label),
        a.packageId,
        positionKey,
        calcNetPositionAmount(info.amount, deduction),
      );
    });
  }

  const positionOf = (row: PackagePaymentRow): number => {
    const member = staffList.find(s => s.name === row.staffName);
    return STAFF_POSITION_WEIGHTS[member?.position || ''] ?? 99;
  };

  const sortedStaff = Array.from(staffRows.values()).sort((x, y) => {
    if (x.department !== y.department) {
      const wx = deptWeight.get(x.department) ?? 999;
      const wy = deptWeight.get(y.department) ?? 999;
      if (wx !== wy) return wx - wy;
      return (x.department || '').localeCompare(y.department || '', 'vi');
    }
    const px = positionOf(x);
    const py = positionOf(y);
    if (px !== py) return px - py;
    const ox = bestPositionOrder.get(x.staffName) ?? 999;
    const oy = bestPositionOrder.get(y.staffName) ?? 999;
    if (ox !== oy) return ox - oy;
    if (x.totalCount !== y.totalCount) return y.totalCount - x.totalCount;
    return x.staffName.localeCompare(y.staffName, 'vi');
  });

  const sortedUnassigned = Array.from(unassignedRows.entries())
    .sort(([kx, rx], [ky, ry]) => {
      const diff = (unassignedOrder.get(kx) ?? 999) - (unassignedOrder.get(ky) ?? 999);
      return diff !== 0 ? diff : rx.staffName.localeCompare(ry.staffName);
    })
    .map(([, row]) => row);

  return [...sortedStaff, ...sortedUnassigned];
}
