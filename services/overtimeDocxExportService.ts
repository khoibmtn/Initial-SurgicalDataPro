/**
 * Overtime DOCX Export Service
 * Tạo và tải xuống file Microsoft Word (.docx) "Giấy báo làm việc ngoài giờ".
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from 'docx';
import { OvertimeReportGroupedData } from './overtimeReportDataService';

const FONT_NAME = 'Times New Roman';

const SOLID_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6, // 0.75 pt
  color: '000000',
};

const DOTTED_BORDER = {
  style: BorderStyle.DOTTED,
  size: 4,
  color: '000000',
};

const NONE_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
};

/**
 * Tạo ô bảng chuẩn với viền tùy biến
 */
function createStyledCell(
  text: string,
  options: {
    width?: number;
    colSpan?: number;
    rowSpan?: number;
    bold?: boolean;
    italic?: boolean;
    align?: AlignmentType;
    topBorder?: typeof SOLID_BORDER;
    bottomBorder?: typeof SOLID_BORDER;
    leftBorder?: typeof SOLID_BORDER;
    rightBorder?: typeof SOLID_BORDER;
    fontSize?: number; // half-pts (20 = 10pt)
  } = {}
): TableCell {
  const {
    width,
    colSpan,
    rowSpan,
    bold = false,
    italic = false,
    align = AlignmentType.LEFT,
    topBorder = SOLID_BORDER,
    bottomBorder = SOLID_BORDER,
    leftBorder = SOLID_BORDER,
    rightBorder = SOLID_BORDER,
    fontSize = 20,
  } = options;

  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: colSpan,
    rowSpan: rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: topBorder,
      bottom: bottomBorder,
      left: leftBorder,
      right: rightBorder,
    },
    margins: {
      top: 60,
      bottom: 60,
      left: 80,
      right: 80,
    },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            font: FONT_NAME,
            bold,
            italics: italic,
            size: fontSize,
          }),
        ],
      }),
    ],
  });
}

/**
 * Tạo file DOCX và kích hoạt tải xuống trình duyệt
 */
export async function exportOvertimeToDocx(data: OvertimeReportGroupedData): Promise<void> {
  // 1. Tiêu đề đơn vị và khoa
  const deptName = data.departmentHeaderName || 'KHOA PHẪU THUẬT - GÂY MÊ HỒI SỨC';
  // Tính độ dài đường kẻ ngang 2/3 tên khoa (~80 dxa mỗi ký tự, min 1800 dxa ~ 3.1cm, max 4200 dxa ~ 7.4cm)
  const lineDxa = Math.round(Math.min(4200, Math.max(1800, deptName.length * 75)));

  const headerElements: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: data.hospitalName || 'TRUNG TÂM Y TẾ THỦY NGUYÊN',
          font: FONT_NAME,
          bold: true,
          size: 24, // 12pt
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: deptName,
          font: FONT_NAME,
          bold: true,
          size: 24, // 12pt
        }),
      ],
    }),
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: lineDxa, type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: {
                top: NONE_BORDER,
                bottom: SOLID_BORDER,
                left: NONE_BORDER,
                right: NONE_BORDER,
              },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 0 },
                  children: [],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({
          text: data.reportTitle || 'GIẤY BÁO LÀM VIỆC NGOÀI GIỜ',
          font: FONT_NAME,
          bold: true,
          size: 28, // 14pt (size +1)
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: data.dateRangeText ? `${data.dateRangeText}` : '',
          font: FONT_NAME,
          italics: true,
          size: 22, // 11pt
        }),
      ],
    }),
  ];

  // 2. Dựng bảng dữ liệu
  const tableRows: TableRow[] = [];

  // 2.1. Header Rows (2 hàng)
  // Hàng 1
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        createStyledCell('TT', { width: 5, rowSpan: 2, bold: true, align: AlignmentType.CENTER, fontSize: 20 }),
        createStyledCell('Họ và tên', { width: 17, rowSpan: 2, bold: true, align: AlignmentType.CENTER, fontSize: 20 }),
        createStyledCell('Nội dung công việc', { width: 38, rowSpan: 2, bold: true, align: AlignmentType.CENTER, fontSize: 20 }),
        createStyledCell('Thời gian làm thêm giờ', { width: 32, colSpan: 4, bold: true, align: AlignmentType.CENTER, fontSize: 20 }),
        createStyledCell('Ghi chú', { width: 8, rowSpan: 2, bold: true, align: AlignmentType.CENTER, fontSize: 20 }),
      ],
    })
  );

  // Hàng 2 (các cột con của Thời gian làm thêm giờ)
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        createStyledCell('Ngày', { width: 8, bold: true, align: AlignmentType.CENTER, fontSize: 19 }),
        createStyledCell('Từ giờ', { width: 8, bold: true, align: AlignmentType.CENTER, fontSize: 19 }),
        createStyledCell('Đến giờ', { width: 8, bold: true, align: AlignmentType.CENTER, fontSize: 19 }),
        createStyledCell('T/số giờ', { width: 8, bold: true, align: AlignmentType.CENTER, fontSize: 19 }),
      ],
    })
  );

  // 2.2. Data Rows theo Khoa -> Nhân viên
  data.departmentBlocks.forEach((deptBlock) => {
    // Nếu lọc Tất cả các khoa: hiển thị dòng tiêu đề khoa
    if (data.isAllDepartments) {
      tableRows.push(
        new TableRow({
          children: [
            createStyledCell('', { width: 5, align: AlignmentType.CENTER, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell(deptBlock.deptCode, { width: 17, bold: true, align: AlignmentType.LEFT, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 38, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 8, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 8, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 8, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 8, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
            createStyledCell('', { width: 8, topBorder: SOLID_BORDER, bottomBorder: SOLID_BORDER }),
          ],
        })
      );
    }

    // Các nhân viên trong khoa
    deptBlock.staffBlocks.forEach((staffBlock) => {
      const surgeriesCount = staffBlock.surgeries.length;

      staffBlock.surgeries.forEach((surgery, sIdx) => {
        const isFirstSurgery = sIdx === 0;
        const isLastSurgery = sIdx === surgeriesCount - 1;

        // Viền trên: Ca đầu tiên có viền liền; các ca sau có viền đứt
        const topBorder = isFirstSurgery ? SOLID_BORDER : DOTTED_BORDER;
        // Viền dưới: Nếu là ca cuối VÀ không có dòng tổng => viền liền; ngược lại là viền đứt
        const bottomBorder = isLastSurgery && !data.showTotalRow ? SOLID_BORDER : DOTTED_BORDER;

        tableRows.push(
          new TableRow({
            children: [
              // STT chỉ hiện ở dòng đầu tiên của nhân viên
              createStyledCell(isFirstSurgery ? String(staffBlock.stt) : '', {
                width: 5,
                align: AlignmentType.CENTER,
                topBorder,
                bottomBorder,
              }),
              // Họ và tên chỉ hiện ở dòng đầu tiên của nhân viên
              createStyledCell(isFirstSurgery ? staffBlock.staffName : '', {
                width: 17,
                align: AlignmentType.LEFT,
                topBorder,
                bottomBorder,
              }),
              // Tên PTTT
              createStyledCell(surgery.surgeryName, {
                width: 38,
                align: AlignmentType.LEFT,
                topBorder,
                bottomBorder,
              }),
              // Ngày
              createStyledCell(surgery.dateText, {
                width: 8,
                align: AlignmentType.CENTER,
                topBorder,
                bottomBorder,
              }),
              // Từ giờ
              createStyledCell(surgery.timeFromText, {
                width: 8,
                align: AlignmentType.CENTER,
                topBorder,
                bottomBorder,
              }),
              // Đến giờ
              createStyledCell(surgery.timeToText, {
                width: 8,
                align: AlignmentType.CENTER,
                topBorder,
                bottomBorder,
              }),
              // T/số giờ
              createStyledCell(surgery.durationText, {
                width: 8,
                align: AlignmentType.CENTER,
                topBorder,
                bottomBorder,
              }),
              // Ghi chú
              createStyledCell('', {
                width: 8,
                topBorder,
                bottomBorder,
              }),
            ],
          })
        );
      });

      // Dòng Tổng (nếu bật tùy chọn showTotalRow)
      if (data.showTotalRow) {
        tableRows.push(
          new TableRow({
            children: [
              createStyledCell('', { width: 5, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
              createStyledCell('', { width: 17, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
              createStyledCell('Tổng', {
                width: 38,
                bold: true,
                align: AlignmentType.CENTER,
                topBorder: DOTTED_BORDER,
                bottomBorder: SOLID_BORDER,
              }),
              createStyledCell('', { width: 8, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
              createStyledCell('', { width: 8, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
              createStyledCell('', { width: 8, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
              createStyledCell(staffBlock.totalDurationText, {
                width: 8,
                bold: true,
                align: AlignmentType.CENTER,
                topBorder: DOTTED_BORDER,
                bottomBorder: SOLID_BORDER,
              }),
              createStyledCell('', { width: 8, topBorder: DOTTED_BORDER, bottomBorder: SOLID_BORDER }),
            ],
          })
        );
      }
    });
  });

  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });

  // 3. Khối 3 chữ ký ở cuối trang
  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NONE_BORDER,
      bottom: NONE_BORDER,
      left: NONE_BORDER,
      right: NONE_BORDER,
      insideHorizontal: NONE_BORDER,
      insideVertical: NONE_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Thủ trưởng duyệt',
                    font: FONT_NAME,
                    bold: true,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Người kiểm tra',
                    font: FONT_NAME,
                    bold: true,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Xác nhận của bộ phận',
                    font: FONT_NAME,
                    bold: true,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      // Hàng trống tạo khoảng cách ký tên
      new TableRow({
        children: [
          new TableCell({
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({ spacing: { before: 800 }, children: [] }),
            ],
          }),
          new TableCell({
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({ spacing: { before: 800 }, children: [] }),
            ],
          }),
          new TableCell({
            borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
            children: [
              new Paragraph({ spacing: { before: 800 }, children: [] }),
            ],
          }),
        ],
      }),
    ],
  });

  // 4. Tạo Document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 567,    // ~1 cm
              bottom: 567, // ~1 cm
              left: 850,   // ~1.5 cm
              right: 567,  // ~1 cm
            },
          },
        },
        children: [
          ...headerElements,
          mainTable,
          new Paragraph({ spacing: { before: 80 }, children: [] }),
          signatureTable,
        ],
      },
    ],
  });

  // 5. Đóng gói và tải xuống file
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `Giay_bao_lam_viec_ngoai_gio_${(data.selectedDepartment !== 'ALL' ? data.selectedDepartment + '_' : '')}${Date.now()}.docx`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
