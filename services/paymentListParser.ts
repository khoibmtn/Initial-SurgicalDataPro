import * as XLSX from 'xlsx';
import { ParsedEntry } from '../types/paymentList';

const LINE_RE = /(?:^|[\s\t])(\d{6,})\s*[-–—]\s*([^\t\n]+?)\s*(?=\t|$)/u;

export interface ParseResult {
  entries: ParsedEntry[];
  /** số dòng không rỗng nhưng không đọc được (tiêu đề khoa, tổng, ...) */
  skipped: number;
}

const IGNORED_HEADER_RE = /^(tổng cộng|tổng số|tổng|trang|cộng|stt|ghi chú|ngày|tháng|năm|bệnh viện|báo cáo|danh sách|kèm theo|tiền|chi phí|thành tiền)/i;
const DEPT_KEYWORD_RE = /(khoa|ngoại|sản|nội|nhi|hồi sức|gây mê|mắt|tai mũi họng|răng hàm mặt|cấp cứu|ung bướu|da liễu|truyền nhiễm|y học|phục hồi|chẩn đoán|kcb|điều trị)/i;

function detectDepartmentHeader(rawLine: string): string | null {
  const parts = rawLine.split('\t').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].replace(/^[\dIVXLCDMivxlcdm]+[.)\s\-–—]+/, '').trim();
  if (!first || first.length < 3 || first.length > 60) return null;
  if (/^\d/.test(first)) return null;
  if (/^[\d,.\s]+$/.test(first)) return null;
  if (IGNORED_HEADER_RE.test(first)) return null;
  if (DEPT_KEYWORD_RE.test(first) || /^[A-ZÀ-Ỹa-zà-ỹ\s]+$/.test(first)) {
    return first;
  }
  return null;
}

function collect(lines: string[]): ParseResult {
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  let currentDepartment: string | undefined = undefined;
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) {
      const dept = detectDepartmentHeader(line);
      if (dept) {
        currentDepartment = dept;
      }
      skipped++;
      continue;
    }
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    entries.push({
      patientId: m[1],
      patientName: m[2].trim(),
      ...(currentDepartment ? { department: currentDepartment } : {}),
    });
  }
  return { entries, skipped };
}

export function parsePaymentListText(text: string): ParseResult {
  return collect(text.split(/\r?\n/));
}

/** Đọc mọi sheet; mỗi hàng nối các ô bằng tab rồi dùng cùng parser. */
export async function parsePaymentListFile(file: File): Promise<ParseResult> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const lines: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (const row of rows) lines.push(row.map(c => String(c ?? '')).join('\t'));
  }
  return collect(lines);
}
