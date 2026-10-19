/**
 * Surgery Schedule Types
 * Data model for the operating room scheduling feature.
 */

/** Một ca mổ đã được đăng ký trên lịch */
export interface ScheduledSurgery {
  id: string;
  date: string;             // yyyy-mm-dd
  patientId: string;        // Mã KCB
  patientName: string;      // Họ tên BN
  tenKT: string;            // Tên phẫu thuật / thủ thuật

  // Thời gian
  startTime: string;        // HH:mm
  endTime: string;          // HH:mm

  // Thiết bị
  machineCode: string;
  machineName: string;

  // Kíp mổ — keys khớp với RoleFilterConfig (ptChinh, ptPhu, bsGM, ktvGM, tdc)
  staff: Record<string, string>;

  // Ghi chú
  note?: string;

  // Trạng thái khóa ca mổ (ngăn chỉnh sửa thông tin, thời gian, kíp mổ)
  locked?: boolean;
  lockedBy?: string;        // uid người khóa
  lockedByName?: string;    // tên hiển thị người khóa
  lockedAt?: number;        // timestamp ms

  // Meta
  createdBy: string;        // uid
  createdByName: string;    // display name
  createdAt: number;        // timestamp ms
  updatedAt: number;        // timestamp ms
}

/** Input cho form tạo/sửa ca mổ (bỏ id, meta) */
export type ScheduledSurgeryInput = Omit<ScheduledSurgery, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>;

/** Loại xung đột phát hiện trên lịch */
export type ConflictType = 'MACHINE' | 'STAFF';

/** Mô tả 1 xung đột cụ thể */
export interface ScheduleConflict {
  type: ConflictType;
  description: string;
  surgeryIds: [string, string];
  resource: string;         // Tên máy hoặc tên nhân sự bị trùng
}

/** Nhãn hiển thị cho từng vị trí kíp mổ */
export const STAFF_ROLE_LABELS: Record<string, string> = {
  ptChinh: 'PT Chính',
  ptPhu: 'PT Phụ',
  bsGM: 'BS Gây mê',
  ktvGM: 'KTV Gây mê',
  tdc: 'TDC',
  gv: 'Giúp việc',
};

/** Nhãn viết tắt cho từng vị trí kíp mổ */
export const STAFF_ROLE_SHORT_LABELS: Record<string, string> = {
  ptChinh: 'PTC',
  ptPhu: 'PTP',
  bsGM: 'BSGM',
  ktvGM: 'KTVGM',
  tdc: 'TDC',
  gv: 'GV',
};

/**
 * Rút gọn họ tên nhân viên theo quy tắc:
 * Giữ các chữ cái đầu của Họ và Tên đệm (viết hoa liền nhau), giữ nguyên Tên chính.
 * Ví dụ: "Nguyễn Thị Thu Hương" -> "NTT Hương", "Đào Văn Điệp" -> "ĐV Điệp".
 */
export function abbreviateStaffName(fullName?: string): string {
  if (!fullName) return '';
  const trimmed = String(fullName).trim();
  if (!trimmed) return '';

  // Hỗ trợ trường hợp chuỗi có nhiều tên cách nhau bởi dấu phẩy hoặc chấm phẩy
  return trimmed
    .split(/([,;]+)/)
    .map((segment) => {
      if (/^[,;]+$/.test(segment)) return segment + ' ';
      const words = segment.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 1) return words[0] || '';
      const givenName = words[words.length - 1];
      const initials = words
        .slice(0, -1)
        .map((w) => w.charAt(0).toUpperCase())
        .join('');
      return `${initials} ${givenName}`;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const STAFF_ROLE_ORDER = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv'];

export interface StaffDisplayItem {
  roleKey: string;
  roleLabel: string;
  roleShortLabel: string;
  name: string;
  shortName: string;
}

/** Lấy danh sách kíp mổ có phân công theo đúng thứ tự vị trí chuẩn */
export function getOrderedStaffEntries(staff?: Record<string, string>): StaffDisplayItem[] {
  if (!staff) return [];
  const items: StaffDisplayItem[] = [];
  const seen = new Set<string>();

  for (const key of STAFF_ROLE_ORDER) {
    const raw = staff[key];
    if (raw && String(raw).trim()) {
      const cleanName = String(raw).trim();
      seen.add(key);
      items.push({
        roleKey: key,
        roleLabel: STAFF_ROLE_LABELS[key] || key,
        roleShortLabel: STAFF_ROLE_SHORT_LABELS[key] || STAFF_ROLE_LABELS[key] || key,
        name: cleanName,
        shortName: abbreviateStaffName(cleanName),
      });
    }
  }

  for (const [key, raw] of Object.entries(staff)) {
    if (seen.has(key)) continue;
    if (raw && String(raw).trim()) {
      const cleanName = String(raw).trim();
      items.push({
        roleKey: key,
        roleLabel: STAFF_ROLE_LABELS[key] || key,
        roleShortLabel: STAFF_ROLE_SHORT_LABELS[key] || STAFF_ROLE_LABELS[key] || key,
        name: cleanName,
        shortName: abbreviateStaffName(cleanName),
      });
    }
  }

  return items;
}

