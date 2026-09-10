import React from 'react';
import { DynamicTable, ColumnDef } from '../common/DynamicTable';
import { matchSearchQuery } from '../../utils/tableSearchUtils';
import { AppConfig } from '../../types';

export interface PaymentDataPrepared {
  enrichedRows: any[];
  groups: { name: string; label: string; subCols: string[] }[];
  cols: string[];
  footerTotals: { total_qty: number; total_amount_val: number; [key: string]: number };
  columnTotals: Record<string, number>;
}

export function getPaymentColumns(columns?: string[]): ColumnDef<any>[] {
  if (!columns) return [];
  return [
    { key: 'stt', label: '#', align: 'center', width: 'w-[30px]' },
    { key: 'department', label: 'Khoa', width: 'min-w-[60px]', className: 'whitespace-nowrap' },
    { key: 'taxId', label: 'Mã số thuế', width: 'min-w-[90px]', className: 'whitespace-nowrap' },
    { key: 'name', label: 'Họ tên', width: 'min-w-[180px]', className: 'whitespace-nowrap' },
    ...columns.map(col => ({
      key: `val_${col}`,
      label: col.replace("PT_", "").replace("TT_", "").replace("-", " "),
      render: (row: any) => (row.values[col] || 0) > 0 ? (row.values[col] || 0) : '-',
      align: 'right' as const,
      width: 'min-w-[60px]'
    })),
    { key: 'total_qty', label: 'Tổng số', align: 'center', width: 'min-w-[50px]', className: 'font-bold' },
    { key: 'total_amount', label: 'Thành tiền', align: 'right', width: 'min-w-[100px]', className: 'font-bold' }
  ];
}

export interface PaymentTableViewProps {
  paymentDataPrepared: PaymentDataPrepared | null;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  visibleCols?: Record<string, boolean>;
  onVisibleColsChange: (cols: Record<string, boolean>) => void;
  dateFormat: string;
  onDateFormatChange: (format: string) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (rows: number) => void;
  config: AppConfig;
}

export const PaymentTableView: React.FC<PaymentTableViewProps> = ({
  paymentDataPrepared,
  searchTerm,
  onSearchChange,
  visibleCols,
  onVisibleColsChange,
  dateFormat,
  onDateFormatChange,
  rowsPerPage,
  onRowsPerPageChange,
  config,
}) => {
  if (!paymentDataPrepared) return null;

  const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentDataPrepared;
  const paymentCols = getPaymentColumns(cols);
  const paymentSearchableCols = { department: true, taxId: true, name: true };
  const filtered = enrichedRows.filter((r: any) =>
    matchSearchQuery(r, searchTerm, paymentSearchableCols, paymentCols)
  );

  const currentVisible = visibleCols || {};
  const isVisible = (key: string) => currentVisible[key] !== false;

  // Custom 2-level thead
  const CustomThead = (
    <thead className="text-xs text-gray-900 border-b border-t-2 border-t-gray-300">
      {/* Row 1: Group Headers */}
      <tr className="border-b">
        {isVisible('stt') && (
          <th rowSpan={2} className="px-1 py-2 sticky left-0 bg-gray-100/95 backdrop-blur z-10 w-[30px] border-r shadow-[1px_0_0_0_rgba(0,0,0,0.05)] text-center align-middle font-bold text-[10px]">
            #
          </th>
        )}
        {isVisible('department') && (
          <th rowSpan={2} className="px-1 py-1 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center text-[11px]">
            Khoa
          </th>
        )}
        {isVisible('taxId') && (
          <th rowSpan={2} className="px-1 py-1 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center text-[11px]">
            Mã số thuế
          </th>
        )}
        {isVisible('name') && (
          <th rowSpan={2} className="px-1 py-1 border-r min-w-[150px] font-bold text-gray-900 bg-gray-100 align-middle text-center">
            Họ tên
          </th>
        )}
        {groups.map(grp => {
          const visibleSubCols = grp.subCols.filter(role => isVisible(`val_${grp.name}-${role}`));
          if (visibleSubCols.length === 0) return null;

          let bgMain = 'bg-gray-200';
          if (grp.name === 'PĐB') bgMain = 'bg-red-300';
          else if (grp.name === 'P1') bgMain = 'bg-orange-300';
          else if (grp.name === 'P2') bgMain = 'bg-yellow-300';
          else if (grp.name === 'P3') bgMain = 'bg-lime-300';
          else if (grp.name === 'TĐB') bgMain = 'bg-cyan-300';
          else if (grp.name === 'T1') bgMain = 'bg-sky-300';
          else if (grp.name === 'T2') bgMain = 'bg-primary-300';
          else if (grp.name === 'T3') bgMain = 'bg-primary-300';
          else if (grp.name === 'TKPL') bgMain = 'bg-purple-300';

          return (
            <th key={grp.name} colSpan={visibleSubCols.length} className={`px-2 py-2 border-r font-bold text-gray-900 ${bgMain} text-center align-middle`}>
              {grp.label}
            </th>
          );
        })}
        {isVisible('total_qty') && (
          <th rowSpan={2} className="px-2 py-2 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center">
            Tổng số
          </th>
        )}
        {isVisible('total_amount') && (
          <th rowSpan={2} className="px-2 py-2 border-r min-w-[120px] font-bold text-gray-900 bg-gray-100 align-middle text-right">
            Thành tiền
          </th>
        )}
      </tr>
      {/* Row 2: Sub-column Headers (Roles) */}
      <tr>
        {groups.flatMap(grp => {
          let bgSub = 'bg-gray-50';
          if (grp.name === 'PĐB') bgSub = 'bg-red-100';
          else if (grp.name === 'P1') bgSub = 'bg-orange-100';
          else if (grp.name === 'P2') bgSub = 'bg-yellow-100';
          else if (grp.name === 'P3') bgSub = 'bg-lime-100';
          else if (grp.name === 'TĐB') bgSub = 'bg-cyan-100';
          else if (grp.name === 'T1') bgSub = 'bg-sky-100';
          else if (grp.name === 'T2') bgSub = 'bg-primary-100';
          else if (grp.name === 'T3') bgSub = 'bg-primary-100';
          else if (grp.name === 'TKPL') bgSub = 'bg-purple-100';

          return grp.subCols.map(role => {
            const colKey = `val_${grp.name}-${role}`;
            if (!isVisible(colKey)) return null;
            return (
              <th key={colKey} className={`px-2 py-1 border-r font-bold text-gray-900 ${bgSub} text-center align-middle text-[11px]`}>
                {role}
              </th>
            );
          });
        })}
      </tr>
    </thead>
  );

  // Unit Price Row
  const ExtraHeader = (
    <tr className="bg-primary-50/30 font-medium text-xs text-primary-800 border-b">
      <td className="px-2 py-1 border-r text-center bg-primary-50 sticky left-0 z-10 font-bold"></td>
      {isVisible('department') && <td className="px-2 py-1 border-r text-right bg-primary-50/50"></td>}
      {isVisible('taxId') && <td className="px-2 py-1 border-r text-right bg-primary-50/50"></td>}
      {isVisible('name') && <td className="px-2 py-1 border-r text-right font-bold text-primary-500 italic">Đơn giá</td>}
      {cols.map(col => {
        if (!isVisible(`val_${col}`)) return null;
        const [loai, role] = col.split('-');
        let configRole: any = "Giúp việc";
        if (role === "Chính") configRole = "Chính";
        else if (role === "Phụ") configRole = "Phụ";
        else if (role === "Giúp việc") configRole = "Giúp việc";
        const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
        return (
          <td key={col} className="px-2 py-1 border-r text-right text-primary-700 font-medium">
            {price > 0 ? price.toLocaleString('en-US') : '-'}
          </td>
        );
      })}
      {isVisible('total_qty') && <td className="px-2 py-1 border-r bg-gray-50"></td>}
      {isVisible('total_amount') && <td className="px-2 py-1 border-r bg-gray-50"></td>}
    </tr>
  );

  // Total Summary Footer Row
  const ExtraFooter = (
    <tr className="bg-primary-700/10 font-bold text-xs text-primary-900 border-t-2 border-primary-200">
      <td className="px-2 py-2 text-center sticky left-0 z-10 bg-primary-50"></td>
      {isVisible('department') && <td className="px-2 py-2 border-r bg-primary-50/50"></td>}
      {isVisible('taxId') && <td className="px-2 py-2 border-r bg-primary-50/50"></td>}
      {isVisible('name') && <td className="px-2 py-2 text-right">TỔNG CỘNG</td>}
      {cols.map(col => {
        if (!isVisible(`val_${col}`)) return null;
        return (
          <td key={col} className="px-2 py-2 border-r text-right">
            {columnTotals[col] > 0 ? columnTotals[col] : '-'}
          </td>
        );
      })}
      {isVisible('total_qty') && <td className="px-2 py-2 border-r text-center">{footerTotals.total_qty}</td>}
      {isVisible('total_amount') && (
        <td className="px-2 py-2 border-r text-right">{footerTotals.total_amount_val.toLocaleString('en-US')}</td>
      )}
    </tr>
  );

  // Custom Row Renderer for Department Separators
  const customRowRender = (row: any, index: number, allRows: any[]) => {
    const isEndOfDept = index < allRows.length - 1 && row.department !== allRows[index + 1].department;
    const borderClass = isEndOfDept ? "border-b-2 border-primary-700" : "border-b";

    return (
      <tr key={index} className={`hover:bg-gray-50 text-xs text-gray-800 ${borderClass}`}>
        <td className="px-2 py-1 border-r text-center sticky left-0 bg-white z-10 font-medium">{index + 1}</td>
        {isVisible('department') && <td className="px-2 py-1 border-r font-medium text-gray-600">{row.department}</td>}
        {isVisible('taxId') && <td className="px-2 py-1 border-r">{row.taxId}</td>}
        {isVisible('name') && <td className="px-2 py-1 border-r font-medium text-gray-700">{row.name}</td>}

        {cols.map(col => {
          if (!isVisible(`val_${col}`)) return null;
          const val = row.values[col];
          return <td key={col} className="px-2 py-1 border-r text-right text-gray-600">{val ? val : '-'}</td>;
        })}

        {isVisible('total_qty') && <td className="px-2 py-1 border-r text-center font-bold">{row.total_qty}</td>}
        {isVisible('total_amount') && (
          <td className="px-2 py-1 border-r text-right font-bold text-primary-700">
            {(() => {
              let total = 0;
              cols.forEach(col => {
                const val = row.values[col] || 0;
                const [loai, role] = col.split('-');
                let configRole: any = "Giúp việc";
                if (role === "Chính") configRole = "Chính";
                else if (role === "Phụ") configRole = "Phụ";
                else if (role === "Giúp việc") configRole = "Giúp việc";
                const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
                total += val * price;
              });
              return total.toLocaleString('en-US');
            })()}
          </td>
        )}
      </tr>
    );
  };

  return (
    <DynamicTable
      data={filtered}
      columns={paymentCols}
      tableName="Bảng Thanh toán phẫu thuật, thủ thuật"
      dateFormat={dateFormat}
      onDateFormatChange={onDateFormatChange}
      rowsPerPage={rowsPerPage}
      onRowsPerPageChange={onRowsPerPageChange}
      defaultVisibleCols={visibleCols}
      onVisibleColsChange={onVisibleColsChange}
      searchableCols={paymentSearchableCols}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      customThead={CustomThead}
      customTfoot={ExtraFooter}
      extraHeaderRow={ExtraHeader}
      customRowRender={customRowRender}
    />
  );
};
