import React, { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { SurgeryRecord } from '../types';

interface ColumnDef<T> {
    key: string;
    label: string;
    render?: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    width?: string;
    className?: string;
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
    type: 'list' | 'payment' | 'overtime';
    orientation: 'portrait' | 'landscape';
    extraHeaderRow?: React.ReactNode;
    extraFooterRow?: React.ReactNode;
    customThead?: React.ReactNode;
    hospitalName?: string;
    reportTab?: 'daily' | 'monthly';
    dailyStats?: DailyPrintStats;
    paymentStatsBlock?: React.ReactNode;
    signatureDate?: Date;
    overtimeGroupedData?: any;
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
    paymentStatsBlock,
    signatureDate,
    overtimeGroupedData
}) => {
    const portalRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const tableRef = React.useRef<HTMLTableElement>(null);

    const colCount = columns?.length || 0;
    const isWideTable = type !== 'overtime' && colCount > 10;
    const isUltraWideTable = type !== 'overtime' && colCount > 20;
    // Khổ giấy khả dụng (mm) trừ lề an toàn để đo và tự động thu phóng vừa khít 100% chiều ngang trang A4
    const targetPrintWidthMm =
        orientation === 'landscape'
            ? (isWideTable ? 281 : 275)
            : (isWideTable ? 194 : 188);

    // Auto-measure & fit to page width, then trigger print when open
    React.useEffect(() => {
        if (!isOpen) return;

        const computeAndApplyFitZoom = () => {
            const portalEl = portalRef.current;
            const contentEl = contentRef.current;
            const tableEl = tableRef.current;
            if (!portalEl || !contentEl || !tableEl) return;

            // Reset zoom to 1 first to measure natural layout width
            contentEl.style.zoom = '1';
            const availableWidth = portalEl.clientWidth;
            const actualTableWidth = tableEl.scrollWidth;

            if (availableWidth > 0 && actualTableWidth > availableWidth) {
                const ratio = (availableWidth - 4) / actualTableWidth;
                const clampedZoom = Math.max(0.32, Math.floor(ratio * 1000) / 1000);
                contentEl.style.zoom = String(clampedZoom);
            } else {
                contentEl.style.zoom = '1';
            }
        };

        const rafId = requestAnimationFrame(() => {
            computeAndApplyFitZoom();
        });

        const timer = setTimeout(() => {
            computeAndApplyFitZoom();
            window.print();
            onClose();
        }, 450);

        return () => {
            cancelAnimationFrame(rafId);
            clearTimeout(timer);
        };
    }, [isOpen, onClose, orientation, colCount, data]);

    if (!isOpen) return null;

    const d = signatureDate || new Date();
    const dateString = `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    const pageMargin = isWideTable ? '0.6cm' : '1cm';
    const baseCellPadding = isUltraWideTable ? '1px 1.5px' : isWideTable ? '1.5px 2.5px' : '2px 4px';
    const baseTableFontSize = isUltraWideTable ? '8px' : isWideTable ? '9px' : '10px';

    // Content to render
    const printContent = (
        <div ref={portalRef} className="print-portal font-[Times_New_Roman] text-black">
            <style>{`
        @media screen {
          /* Render off-screen at exact A4 printable width so table scrollWidth can be measured accurately before window.print() */
          .print-portal {
            position: fixed;
            top: 0;
            left: -10000px;
            width: ${targetPrintWidthMm}mm;
            visibility: hidden;
            pointer-events: none;
            z-index: -1;
            display: block;
            background: white;
          }
        }
        @media print {
          /* Set page size based on provided orientation */
          @page { 
            size: A4 ${orientation}; 
            margin: ${pageMargin}; 
          }
          body > *:not(.print-portal) { display: none !important; }
          .print-portal {
            display: block !important;
            visibility: visible !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 9999;
          }
        }
        /* Shared table layout rules for both off-screen measurement and print */
        .print-portal table {
          table-layout: auto;
          width: 100% !important;
          border-spacing: 0;
          border-collapse: collapse;
        }
        .print-portal td, .print-portal th {
          word-wrap: normal;
          overflow-wrap: normal;
          padding: ${baseCellPadding} !important;
        }
        .print-portal th {
          white-space: normal;
          word-break: break-word;
          line-height: 1.15;
        }
        /* Specific widths for print - tightly fit content */
        .print-portal .col-stt { width: 22px; }
        .print-portal .col-dept { width: 1%; white-space: ${isUltraWideTable ? 'normal' : 'nowrap'}; }
        .print-portal .col-tax { width: 1%; white-space: nowrap; }
        .print-portal .col-name { white-space: ${isUltraWideTable ? 'normal' : 'nowrap'}; }
        .print-portal .col-total { width: 1%; white-space: nowrap; font-weight: bold; }
        .print-portal .col-numeric { width: 1%; white-space: nowrap; }
      `}</style>

            <div ref={contentRef} className="print-content w-full h-full">
                {type === 'overtime' ? (
                    <div>
                        {/* OVERTIME REPORT HEADER */}
                        <div className="text-center mb-6">
                            <p className="font-bold uppercase text-[12px] tracking-wide">
                                {overtimeGroupedData?.hospitalName || hospitalName}
                            </p>
                            <div className="inline-block text-center mx-auto mt-0.5">
                                <p className="font-bold uppercase text-[12px] tracking-wide">
                                    {overtimeGroupedData?.departmentHeaderName || 'KHOA PHẪU THUẬT - GÂY MÊ HỒI SỨC'}
                                </p>
                                <div className="w-2/3 mx-auto mt-1" style={{ borderBottom: '1.5px solid black' }}></div>
                            </div>
                            <h1 className="font-bold uppercase text-[15px] mt-6 mb-1 tracking-wide">
                                {title || 'GIẤY BÁO LÀM VIỆC NGOÀI GIỜ'}
                            </h1>
                            <p className="text-[11px] italic">
                                {overtimeGroupedData?.dateRangeText || dateRange}
                            </p>
                        </div>

                        {/* TABLE */}
                        <table ref={tableRef} className="w-full border-collapse border border-black text-[10px] font-[Times_New_Roman]">
                            <thead>
                                <tr className="bg-transparent">
                                    <th rowSpan={2} className="border border-black px-1 py-1 text-center font-bold w-[30px]">TT</th>
                                    <th rowSpan={2} className="border border-black px-2 py-1 text-center font-bold w-[120px]">Họ và tên</th>
                                    <th rowSpan={2} className="border border-black px-2 py-1 text-center font-bold">Nội dung công việc</th>
                                    <th colSpan={4} className="border border-black px-1 py-1 text-center font-bold">Thời gian làm thêm giờ</th>
                                    <th rowSpan={2} className="border border-black px-1 py-1 text-center font-bold w-[60px]">Ghi chú</th>
                                </tr>
                                <tr className="bg-transparent">
                                    <th className="border border-black px-1 py-1 text-center font-bold w-[45px]">Ngày</th>
                                    <th className="border border-black px-1 py-1 text-center font-bold w-[50px]">Từ giờ</th>
                                    <th className="border border-black px-1 py-1 text-center font-bold w-[50px]">Đến giờ</th>
                                    <th className="border border-black px-1 py-1 text-center font-bold w-[55px]">T/số giờ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overtimeGroupedData?.departmentBlocks?.map((deptBlock: any) => (
                                    <React.Fragment key={deptBlock.deptCode}>
                                        {/* Tiêu đề khoa khi chọn Tất cả các khoa */}
                                        {overtimeGroupedData.isAllDepartments && (
                                            <tr className="border-t border-b border-black font-bold break-inside-avoid">
                                                <td className="border-l border-r border-black px-1 py-1 text-center"></td>
                                                <td className="border-r border-black px-2 py-1 text-left font-bold">{deptBlock.deptCode}</td>
                                                <td className="border-r border-black px-2 py-1"></td>
                                                <td className="border-r border-black px-1 py-1"></td>
                                                <td className="border-r border-black px-1 py-1"></td>
                                                <td className="border-r border-black px-1 py-1"></td>
                                                <td className="border-r border-black px-1 py-1"></td>
                                                <td className="border-r border-black px-1 py-1"></td>
                                            </tr>
                                        )}

                                        {/* Danh sách nhân viên trong khoa */}
                                        {deptBlock.staffBlocks?.map((staffBlock: any) => {
                                            const totalSurgeries = staffBlock.surgeries.length;
                                            return (
                                                <React.Fragment key={staffBlock.staffName}>
                                                    {staffBlock.surgeries.map((s: any, sIdx: number) => {
                                                        const isFirst = sIdx === 0;
                                                        const isLast = sIdx === totalSurgeries - 1;
                                                        const isSolidBottom = isLast && !overtimeGroupedData.showTotalRow;

                                                        return (
                                                            <tr
                                                                key={s.id + '-' + sIdx}
                                                                className="break-inside-avoid"
                                                                style={{
                                                                    borderBottom: isSolidBottom ? '1px solid black' : '1px dotted #444',
                                                                }}
                                                            >
                                                                <td className="border-l border-r border-black px-1 py-1 text-center align-top">
                                                                    {isFirst ? staffBlock.stt : ''}
                                                                </td>
                                                                <td className="border-r border-black px-2 py-1 text-left align-top">
                                                                    {isFirst ? staffBlock.staffName : ''}
                                                                </td>
                                                                <td className="border-r border-black px-2 py-1 text-left align-top">
                                                                    {s.surgeryName}
                                                                </td>
                                                                <td className="border-r border-black px-1 py-1 text-center align-top">
                                                                    {s.dateText}
                                                                </td>
                                                                <td className="border-r border-black px-1 py-1 text-center align-top">
                                                                    {s.timeFromText}
                                                                </td>
                                                                <td className="border-r border-black px-1 py-1 text-center align-top">
                                                                    {s.timeToText}
                                                                </td>
                                                                <td className="border-r border-black px-1 py-1 text-center align-top font-medium">
                                                                    {s.durationText}
                                                                </td>
                                                                <td className="border-r border-black px-1 py-1 text-center align-top"></td>
                                                            </tr>
                                                        );
                                                    })}

                                                    {/* Dòng Tổng */}
                                                    {overtimeGroupedData.showTotalRow && (
                                                        <tr
                                                            className="break-inside-avoid font-bold"
                                                            style={{ borderBottom: '1px solid black' }}
                                                        >
                                                            <td className="border-l border-r border-black px-1 py-1 text-center"></td>
                                                            <td className="border-r border-black px-2 py-1"></td>
                                                            <td className="border-r border-black px-2 py-1 text-center font-bold">Tổng</td>
                                                            <td className="border-r border-black px-1 py-1"></td>
                                                            <td className="border-r border-black px-1 py-1"></td>
                                                            <td className="border-r border-black px-1 py-1"></td>
                                                            <td className="border-r border-black px-1 py-1 text-center font-bold">
                                                                {staffBlock.totalDurationText}
                                                            </td>
                                                            <td className="border-r border-black px-1 py-1"></td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>

                        {/* SIGNATURES FOR OVERTIME */}
                        <div className="mt-3.5 text-center text-[11px] font-bold break-inside-avoid font-[Times_New_Roman]">
                            <div className="grid grid-cols-3 gap-4 w-full">
                                <div>
                                    <p className="font-bold">Thủ trưởng duyệt</p>
                                    <div className="h-16"></div>
                                </div>
                                <div>
                                    <p className="font-bold">Người kiểm tra</p>
                                    <div className="h-16"></div>
                                </div>
                                <div>
                                    <p className="font-bold">Xác nhận của bộ phận</p>
                                    <div className="h-16"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>
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
                        <table ref={tableRef} style={{ fontSize: baseTableFontSize }} className="w-full border-collapse border border-black font-[Times_New_Roman]">
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
                                                if (col.key === 'name' || col.key === 'staffName') extraClass = "col-name";
                                                if (col.key === 'total_amount' || col.key === 'total') extraClass = "col-total";
                                                if (col.key === 'total_qty' || col.key === 'totalCount' || col.key.startsWith('val_')) extraClass = "col-numeric";

                                                return (
                                                    <td key={col.key} className={`border border-black ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'} ${col.className || ''} ${deptBorderClass} ${extraClass}`}>
                                                        {col.key === 'stt' ? (idx + 1) : (col.render ? col.render(row) : (row[col.key] || ''))}
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
                )}
            </div>
        </div>
    );

    return createPortal(printContent, document.body);
};
