import React from 'react';
import { SurgeryRecord, ProcessedStats, AppConfig } from '../../types';
import { ColumnDef } from '../common/DynamicTable';
import { PaymentDataPrepared } from './PaymentTableView';

export interface BuildPrintConfigParams {
  type: 'list' | 'payment';
  reportTab: 'daily' | 'monthly';
  dateRangeText: string;
  validRecords: SurgeryRecord[];
  columnsList: ColumnDef<SurgeryRecord>[];
  listVisibleCols?: Record<string, boolean>;
  paymentVisibleCols?: Record<string, boolean>;
  derivedStats: ProcessedStats;
  ptCount: number;
  ttCount: number;
  paymentDataPrepared: PaymentDataPrepared | null;
  paymentCols: ColumnDef<any>[];
  config: AppConfig;
}

export function buildPrintConfig(params: BuildPrintConfigParams): any | null {
  const {
    type,
    reportTab,
    dateRangeText,
    validRecords,
    columnsList,
    listVisibleCols = {},
    paymentVisibleCols = {},
    derivedStats,
    ptCount,
    ttCount,
    paymentDataPrepared,
    paymentCols,
    config,
  } = params;

  if (type === 'list') {
    const listPrintConfig: any = {
      type: 'list',
      title: 'DANH SÁCH PHẪU THUẬT',
      dateRange: dateRangeText || '',
      data: validRecords || [],
      columns: columnsList.filter(c => listVisibleCols[c.key] !== false),
      reportTab: reportTab,
      // For monthly: signature date = endDate + 1 day (parsed from dateRangeText)
      ...(reportTab === 'monthly' ? (() => {
        const m = (dateRangeText || '').match(/đến ngày (\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
          d.setDate(d.getDate() + 1);
          return { signatureDate: d };
        }
        return {};
      })() : {}),
    };

    // Add stats for daily report only
    if (reportTab === 'daily') {
      listPrintConfig.dailyStats = {
        ptCount,
        ttCount,
        lowPaymentCount: derivedStats.lowPaymentCount || 0,
        staffConflicts: derivedStats.staffConflicts,
        machineConflicts: derivedStats.machineConflicts,
        missingMachines: derivedStats.missingMachines,
        missingAssistantCount: derivedStats.missingAssistantCount,
        violateMinTimeCount: derivedStats.violateMinTimeCount,
      };
    }

    // Add surgery type statistics for monthly list print
    if (reportTab === 'monthly') {
      const typeLabels: Record<string, string> = {
        PĐB: "Phẫu thuật đặc biệt",
        P1: "Phẫu thuật loại 1",
        P2: "Phẫu thuật loại 2",
        P3: "Phẫu thuật loại 3",
        TĐB: "Thủ thuật đặc biệt",
        T1: "Thủ thuật loại 1",
        T2: "Thủ thuật loại 2",
        T3: "Thủ thuật loại 3",
        TKPL: "Thủ thuật Khác/KPL",
      };
      const typeOrder = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];

      const surgeryCounts: Record<string, number> = {};
      validRecords.forEach(record => {
        const loai = record.loaiPTTT;
        if (loai) {
          surgeryCounts[loai] = (surgeryCounts[loai] || 0) + (record.soLuong || 1);
        }
      });

      const totalPT = Object.entries(surgeryCounts)
        .filter(([loai]) => loai.startsWith('P'))
        .reduce((s, [, c]) => s + c, 0);
      const totalTT = Object.entries(surgeryCounts)
        .filter(([loai]) => loai.startsWith('T'))
        .reduce((s, [, c]) => s + c, 0);

      const ListSurgeryStatsBlock = (
        <div className="flex flex-col gap-0.5 mt-2">
          {totalPT > 0 && <div className="font-bold underline">Tổng số phẫu thuật: {Number.isInteger(totalPT) ? totalPT : totalPT.toFixed(2)} ca</div>}
          {totalTT > 0 && <div className="font-bold underline">Tổng số thủ thuật: {Number.isInteger(totalTT) ? totalTT : totalTT.toFixed(2)} ca</div>}
          {Object.entries(surgeryCounts)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => {
              const indA = typeOrder.indexOf(a[0]);
              const indB = typeOrder.indexOf(b[0]);
              return (indA === -1 ? 99 : indA) - (indB === -1 ? 99 : indB);
            })
            .map(([loai, count]) => (
              <div key={loai}>
                {typeLabels[loai] || loai}: {Number.isInteger(count) ? count : count.toFixed(2)} ca
              </div>
            ))}
        </div>
      );

      listPrintConfig.paymentStatsBlock = ListSurgeryStatsBlock;
    }

    return listPrintConfig;
  }

  if (type === 'payment' && paymentDataPrepared) {
    const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentDataPrepared;
    const isVisible = (key: string) => paymentVisibleCols[key] !== false;
    const filteredPaymentCols = paymentCols.filter(c => isVisible(c.key));

    const PrintThead = (
      <thead className="text-xs text-black border-b border-black">
        <tr className="border-b border-black">
          {isVisible('stt') && <th rowSpan={2} className="px-1 py-1 border-r border-black w-[30px] text-center align-middle font-bold text-[10px]">STT</th>}
          {isVisible('department') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-dept">Khoa</th>}
          {isVisible('taxId') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-tax">Mã số thuế</th>}
          {isVisible('name') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[11px] col-name">Họ tên</th>}
          {groups.map(grp => {
            const visibleSubCols = grp.subCols.filter(role => isVisible(`val_${grp.name}-${role}`));
            if (visibleSubCols.length === 0) return null;
            return (
              <th key={grp.name} colSpan={visibleSubCols.length} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px]">{grp.label}</th>
            );
          })}
          {isVisible('total_qty') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-numeric">Tổng số</th>}
          {isVisible('total_amount') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-right align-middle text-[10px] col-total">Thành tiền</th>}
        </tr>
        <tr>
          {groups.flatMap(grp => grp.subCols.map(role => {
            const colKey = `val_${grp.name}-${role}`;
            if (!isVisible(colKey)) return null;
            return (
              <th key={colKey} className="px-1 py-0.5 border border-black font-bold text-center align-middle text-[9px] col-numeric">{role}</th>
            );
          }))}
        </tr>
      </thead>
    );

    const PrintFooter = (
      <tr className="font-bold text-xs">
        <td className="px-1 py-1 border border-black text-center col-stt"></td>
        {isVisible('department') && <td className="px-1 py-1 border border-black col-dept"></td>}
        {isVisible('taxId') && <td className="px-1 py-1 border border-black col-tax"></td>}
        {isVisible('name') && <td className="px-1 py-1 text-right border border-black col-name text-[11px]">TỔNG CỘNG</td>}
        {cols.map(col => {
          if (!isVisible(`val_${col}`)) return null;
          return <td key={col} className="px-1 py-1 border border-black text-right col-numeric">{columnTotals[col] > 0 ? columnTotals[col] : '-'}</td>;
        })}
        {isVisible('total_qty') && <td className="px-1 py-1 border border-black text-center col-numeric">{footerTotals.total_qty}</td>}
        {isVisible('total_amount') && <td className="px-1 py-1 border border-black text-right col-total">{footerTotals.total_amount_val.toLocaleString('en-US')}</td>}
      </tr>
    );

    const PrintExtraHeader = (
      <tr className="font-bold text-xs text-center italic">
        <td className="px-1 py-0.5 border border-black col-stt"></td>
        {isVisible('department') && <td className="px-1 py-0.5 border border-black col-dept"></td>}
        {isVisible('taxId') && <td className="px-1 py-0.5 border border-black col-tax"></td>}
        {isVisible('name') && <td className="px-1 py-0.5 border border-black text-right opacity-0 text-[10px] col-name">Đơn giá</td>}
        {cols.map(col => {
          if (!isVisible(`val_${col}`)) return null;
          const [loai, role] = col.split('-');
          let configRole: any = "Giúp việc";
          if (role === "Chính") configRole = "Chính";
          else if (role === "Phụ") configRole = "Phụ";
          else if (role === "Giúp việc") configRole = "Giúp việc";
          const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
          return <td key={col} className="px-1 py-0.5 border border-black text-right text-[10px] col-numeric">{price.toLocaleString('en-US')}</td>;
        })}
        {isVisible('total_qty') && <td className="px-1 py-0.5 border border-black text-[10px] col-numeric"></td>}
        {isVisible('total_amount') && <td className="px-1 py-0.5 border border-black text-[10px] col-total"></td>}
      </tr>
    );

    const surgeryCountsByType: Record<string, number> = {};
    validRecords.forEach(record => {
      const loai = record.loaiPTTT;
      if (loai) {
        surgeryCountsByType[loai] = (surgeryCountsByType[loai] || 0) + (record.soLuong || 1);
      }
    });

    const typeLabels: Record<string, string> = {
      PĐB: "Phẫu thuật đặc biệt",
      P1: "Phẫu thuật loại 1",
      P2: "Phẫu thuật loại 2",
      P3: "Phẫu thuật loại 3",
      TĐB: "Thủ thuật đặc biệt",
      T1: "Thủ thuật loại 1",
      T2: "Thủ thuật loại 2",
      T3: "Thủ thuật loại 3",
      TKPL: "Thủ thuật Khác/KPL",
    };

    const totalPT_pay = Object.entries(surgeryCountsByType)
      .filter(([loai]) => loai.startsWith('P'))
      .reduce((s, [, c]) => s + c, 0);
    const totalTT_pay = Object.entries(surgeryCountsByType)
      .filter(([loai]) => loai.startsWith('T'))
      .reduce((s, [, c]) => s + c, 0);

    const PrintPaymentStats = (
      <div className="flex flex-col gap-0.5 mt-2">
        {totalPT_pay > 0 && <div className="font-bold underline">Tổng số phẫu thuật: {Number.isInteger(totalPT_pay) ? totalPT_pay : totalPT_pay.toFixed(2)} ca</div>}
        {totalTT_pay > 0 && <div className="font-bold underline">Tổng số thủ thuật: {Number.isInteger(totalTT_pay) ? totalTT_pay : totalTT_pay.toFixed(2)} ca</div>}
        {Object.entries(surgeryCountsByType)
          .filter(([_, count]) => count > 0)
          .sort((a, b) => {
            const order = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];
            const indA = order.indexOf(a[0]);
            const indB = order.indexOf(b[0]);
            return (indA === -1 ? 99 : indA) - (indB === -1 ? 99 : indB);
          })
          .map(([loai, count]) => (
            <div key={loai}>
              {typeLabels[loai] || loai}: {Number.isInteger(count) ? count : count.toFixed(2)} ca
            </div>
          ))}
      </div>
    );

    return {
      type: 'payment',
      title: 'BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT',
      dateRange: dateRangeText || '',
      data: enrichedRows,
      columns: filteredPaymentCols,
      customThead: PrintThead,
      extraFooterRow: PrintFooter,
      extraHeaderRow: PrintExtraHeader,
      paymentStatsBlock: PrintPaymentStats,
      // For monthly: signature date = endDate + 1 day (parsed from dateRangeText)
      ...(reportTab === 'monthly' ? (() => {
        const m = (dateRangeText || '').match(/đến ngày (\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
          d.setDate(d.getDate() + 1);
          return { signatureDate: d };
        }
        return {};
      })() : {}),
    };
  }

  return null;
}
