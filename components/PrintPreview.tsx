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

interface PrintPreviewProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    dateRange: string;
    data: any[];
    columns: ColumnDef<any>[];
    type: 'list' | 'payment';
    orientation: 'portrait' | 'landscape'; // NEW: Accept orientation prop
    extraHeaderRow?: React.ReactNode; // For Unit Price row in Payment
    extraFooterRow?: React.ReactNode; // For Totals in Payment
    customThead?: React.ReactNode; // For Grouped headers in Payment
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
    isOpen,
    onClose,
    title,
    dateRange,
    data,
    columns,
    type,
    orientation, // NEW: Use prop instead of state
    extraHeaderRow,
    extraFooterRow,
    customThead
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
            margin: 10mm; 
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
        }
        /* Hide on screen */
        .print-portal { display: none; }
      `}</style>

            <div className="print-content w-full h-full">

                {/* REPORT HEADER */}
                <div className="mb-6">
                    {/* Hospital Name */}
                    <div className="inline-block text-center text-sm font-bold uppercase leading-relaxed mb-2">
                        <p>SỞ Y TẾ HẢI PHÒNG</p>
                        <p>BỆNH VIỆN ĐA KHOA THỦY NGUYÊN</p>
                        <div className="bg-black h-[1px] w-1/3 mx-auto mt-0.5"></div>
                    </div>

                    {/* Title */}
                    <div className="text-center w-full">
                        <h1 className="text-xl font-bold uppercase mb-1">{title}</h1>
                        <p className="text-sm italic">{dateRange}</p>
                    </div>
                </div>

                {/* TABLE */}
                <table className="w-full border-collapse border border-black text-[11px] font-[Times_New_Roman]">
                    {customThead ? customThead : (
                        <thead>
                            <tr className="bg-gray-100 print:bg-transparent">
                                <th className="border border-black px-2 py-2 text-center w-[40px]">STT</th>
                                {columns.map((col) => (
                                    <th key={col.key} className={`border border-black px-2 py-2 font-bold ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`} style={{ width: col.width }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {extraHeaderRow}
                        {data.map((row, idx) => (
                            <tr key={idx} className="break-inside-avoid">
                                {!customThead && <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>}

                                {customThead && <td className="border border-black px-2 py-1 text-center">{idx + 1}</td>}

                                {columns.map((col) => (
                                    <td key={col.key} className={`border border-black px-2 py-1 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'} ${col.className || ''}`}>
                                        {col.render ? col.render(row) : (row[col.key] || '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {extraFooterRow}
                    </tbody>
                </table>

                {/* SIGNATURES */}
                <div className="mt-6 text-center text-sm font-bold break-inside-avoid font-[Times_New_Roman]">
                    {/* Date above Người lập */}
                    <div className="flex justify-end mb-1 pr-8">
                        <p className="font-normal italic text-xs">{dateString}</p>
                    </div>
                    {/* All signature titles aligned */}
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
                </div>

            </div>
        </div>
    );

    return createPortal(printContent, document.body);
};
