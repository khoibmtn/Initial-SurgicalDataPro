import * as XLSX from 'xlsx';
import { ParsedEntry } from '../types/paymentList';

const LINE_RE = /(?:^|[\s\t])(\d{6,})\s*[-–—]\s*([^\t\n]+?)\s*(?=\t|$)/u;

export interface ParseResult {
  entries: ParsedEntry[];
  /** số dòng không rỗng nhưng không đọc được (tiêu đề khoa, tổng, ...) */
  skipped: number;
}

function collect(lines: string[]): ParseResult {
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) {
      skipped++;
      continue;
    }
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    entries.push({ patientId: m[1], patientName: m[2].trim() });
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
