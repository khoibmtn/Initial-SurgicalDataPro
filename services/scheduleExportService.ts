/**
 * Schedule Export Service
 * Xuất lịch mổ ngày ra file Excel.
 */
import * as XLSX from 'xlsx';
import type { ScheduledSurgery } from '../types/schedule';
import { STAFF_ROLE_LABELS } from '../types/schedule';

/**
 * Xuất danh sách ca mổ của 1 ngày ra Excel.
 */
export function exportScheduleToExcel(
  entries: ScheduledSurgery[],
  dateLabel: string,
): void {
  if (entries.length === 0) return;

  const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const rows = sorted.map((entry, i) => {
    const staffEntries = Object.entries(entry.staff || {});
    const staffObj: Record<string, string> = {};
    for (const [role, name] of staffEntries) {
      const label = STAFF_ROLE_LABELS[role] || role;
      staffObj[label] = name || '';
    }

    return {
      'STT': i + 1,
      'Mã KCB': entry.patientId,
      'Họ tên BN': entry.patientName,
      'Tên phẫu thuật': entry.tenKT,
      'Bắt đầu': entry.startTime,
      'Kết thúc': entry.endTime,
      'Máy': entry.machineName || '',
      ...staffObj,
      'Ghi chú': entry.note || '',
      'Đăng ký bởi': entry.createdByName,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lịch mổ');

  // Auto-width columns
  if (rows.length > 0) {
    const colWidths = Object.keys(rows[0]).map((k) => ({
      wch: Math.max(k.length + 2, 12),
    }));
    ws['!cols'] = colWidths;
  }

  const safeDate = dateLabel.replace(/[/\\:*?"<>|]/g, '-');
  XLSX.writeFile(wb, `Lich_mo_${safeDate}.xlsx`);
}
