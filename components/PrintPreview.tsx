import React, { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { SurgeryRecord } from '../types';

interface ColumnDef<T> {
    key: string;
    label: string;
    render?: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    width?: string;
}

interface DailyPrintStats {
    ptCount: number;
    ttCount: number;
    lowPaymentCount: number;
    staffConflicts: number;
    machineConflicts: number;
    missingMachines: number;
    missingAssistantCount: number;
    violateMinTimeCount: number;
}

interface PrintPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    dateRange: string;
    data: any[];
    columns: ColumnDef<any>[];
    type: 'list' | 'payment';
    orientation: 'portrait' | 'landscape';
    extraHeaderRow?: React.ReactNode;
    extraFooterRow?: React.ReactNode;
    customThead?: React.ReactNode;
    hospitalName?: string;
    reportTab?: 'daily' | 'monthly'; // Which tab triggered the print
    dailyStats?: DailyPrintStats; // Stats for daily report summary row
    paymentStatsBlock?: React.ReactNode; // Extra block for payment stats
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
    isOpen,
    onClose,
    title,
    dateRange,
    data,
    columns,
    type,
    orientation,
    extraHeaderRow,
    extraFooterRow,
    customThead,
    hospitalName = "BỆNH VIỆN ĐA KHOA THỦY NGUYÊN",
    reportTab,
    dailyStats,
    paymentStatsBlock
}) => {
    // Auto-print when open
    React.useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                window.print();
                onClose();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const today = new Date();
    const dateString = `Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

    // Content to render
    const printContent = (
        <div className="print-portal font-[Times_New_Roman] text-black">
            <style>{`
        @media print {
          /* Set page size based on provided orientation */
          @page { 
            size: A4 ${orientation}; 
            margin: 1cm; 
          }
          body > *:not(.print-portal) { display: none !important; }
          .print-portal {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 9999;
          }
          /* Ensure table fits page width */
          table {
            table-layout: auto;
            width: 100% !important;
            border-spacing: 0;
            border-collapse: collapse;
          }
          td, th {
            word-wrap: normal; /* Don't wrap unless forced */
            overflow-wrap: normal;
            padding: 2px 4px !important;
          }
          /* Specific widths for print - tightly fit content */
          .col-stt { width: 25px; }
          .col-dept { width: 1%; white-space: nowrap; }
          .col-tax { width: 1%; white-space: nowrap; }
          .col-name { white-space: nowrap; }
          .col-total { width: 1%; white-space: nowrap; font-weight: bold; }
          .col-numeric { width: 1%; white-space: nowrap; }
        }
        /* Hide on screen */
        .print-portal { display: none; }
      `}</style>

            <div className="print-content w-full h-full">

                {/* REPORT HEADER */}
                <div className="mb-4">
                    {/* Hospital Name */}
                    <div className="inline-block text-center text-sm font-bold uppercase leading-relaxed mb-1">
                        <p>SỞ Y TẾ HẢI PHÒNG</p>
                        <p>{hospitalName}</p>
                        <div className="bg-black h-[1px] w-1/3 mx-auto mt-0.5"></div>
                    </div>

                    {/* Title */}
                    <div className="text-center w-full">
                        <h1 className="text-xl font-bold uppercase mb-0.5 whitespace-nowrap">{title}</h1>
                        <p className="text-[11px] italic">{dateRange}</p>
                    </div>
                </div>

                {/* TABLE */}
                <table className="w-full border-collapse border border-black text-[10px] font-[Times_New_Roman]">
                    {customThead ? customThead : (
                        <thead>
                            <tr className="bg-gray-100 print:bg-transparent">
                                {columns.map((col) => {
                                    let extraClass = "";
                                    if (col.key === 'stt') extraClass = "col-stt";
                                    if (col.key === 'taxId') extraClass = "col-tax";
                                    if (col.key === 'name') extraClass = "col-name";
                                    if (col.key === 'total_amount') extraClass = "col-total";
                                    return (
                                        <th key={col.key} className={`border border-black font-bold ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'} ${extraClass}`} style={{ width: col.width }}>
                                            {col.label}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {extraHeaderRow}
                        {data.map((row, idx) => {
                            const isFirstRowOverall = idx === 0;
                            const deptBorderClass = row.isNewDept && !isFirstRowOverall ? 'border-t-2 border-t-black' : '';

                            return (
                                <tr key={idx} className="break-inside-avoid border-b border-black">
                                    {columns.map((col) => {
                                        let extraClass = "";
                                        if (col.key === 'stt') extraClass = "col-stt";
                                        if (col.key === 'department') extraClass = "col-dept";
                                        if (col.key === 'taxId') extraClass = "col-tax";
                                        if (col.key === 'name') extraClass = "col-name";
                                        if (col.key === 'total_amount') extraClass = "col-total";
                                        if (col.key === 'total_qty' || col.key.startsWith('val_')) extraClass = "col-numeric";

                                        return (
                                            <td key={col.key} className={`border border-black ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'} ${col.className || ''} ${deptBorderClass} ${extraClass}`}>
                                                {col.render ? col.render(row) : (row[col.key] || '')}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {extraFooterRow}
                    </tbody>
                </table>

                {/* DAILY LIST: Stats Summary Row */}
                {reportTab === 'daily' && type === 'list' && dailyStats && (
                    <div className="mt-2 mb-1 text-[10px] font-[Times_New_Roman] break-inside-avoid">
                        <div className="flex justify-between px-1">
                            <span><b>Tổng số PT:</b> {dailyStats.ptCount}&nbsp;&nbsp;&nbsp;<b>TT:</b> {dailyStats.ttCount}</span>
                            <span><b>Tỷ lệ TT&lt;100%:</b> {dailyStats.lowPaymentCount}</span>
                            <span><b>Trùng NV:</b> {dailyStats.staffConflicts}</span>
                            <span><b>Trùng máy:</b> {dailyStats.machineConflicts}</span>
                            <span><b>Thiếu mã máy:</b> {dailyStats.missingMachines}</span>
                            <span><b>Chưa điền GV:</b> {dailyStats.missingAssistantCount}</span>
                            <span><b>Lỗi thời gian:</b> {dailyStats.violateMinTimeCount}</span>
                        </div>
                    </div>
                )}

                {/* PAYMENT STATS BLOCK */}
                {paymentStatsBlock && (
                    <div className="mt-4 mb-2 text-[12px] font-[Times_New_Roman] break-inside-avoid text-left pl-2 font-bold leading-relaxed">
                        {paymentStatsBlock}
                    </div>
                )}

                {/* SIGNATURES */}
                <div className="mt-6 text-center text-sm font-bold break-inside-avoid font-[Times_New_Roman]">
                    {/* Date above Người lập */}
                    <div className="flex justify-end mb-1 pr-8">
                        <p className="font-normal italic text-xs">{dateString}</p>
                    </div>

                    {/* Daily List: 3 signatures */}
                    {reportTab === 'daily' && type === 'list' ? (
                        <div className="flex justify-between px-20">
                            <div>
                                <p className="uppercase">Điều dưỡng trưởng</p>
                            </div>
                            <div>
                                <p className="uppercase">Bác sĩ trực</p>
                            </div>
                            <div>
                                <p className="uppercase">Người lập</p>
                            </div>
                        </div>
                    ) : (
                        /* Default: full 5 (or 4) signatures */
                        <div className="flex justify-between px-8">
                            <div>
                                <p className="uppercase">Giám đốc</p>
                            </div>
                            {type === 'list' && (
                                <div>
                                    <p className="uppercase">KHTH</p>
                                </div>
                            )}
                            <div>
                                <p className="uppercase">TCKT</p>
                            </div>
                            <div>
                                <p className="uppercase">Trưởng khoa</p>
                            </div>
                            <div>
                                <p className="uppercase">Người lập</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );

    return createPortal(printContent, document.body);
};
