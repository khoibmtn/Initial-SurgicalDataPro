// ─── Audit Log Service ────────────────────────────────────────────────────────
// Quản lý ghi nhận và truy vết chỉnh sửa số liệu bằng Firebase Realtime Database
// Đồng bộ tức thời, minh bạch thao tác cho Trưởng khoa và Quản trị viên

import { ref, set, onValue, query, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase';
import type {
  AuditAction,
  AuditLogEntry,
  CreateAuditLogParams,
  FieldDiff,
  AuditFilterParams,
} from '../types/auditLog';
import type { SurgeryRecord } from '../types';

const AUDIT_LOGS_PATH = 'audit_logs';

/**
 * Ghi nhận một sự kiện kiểm toán / truy vết vào hệ thống
 */
export async function logAuditEvent(params: CreateAuditLogParams): Promise<string> {
  try {
    const timestamp = new Date().toISOString();
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const entry: AuditLogEntry = {
      id,
      timestamp,
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      userDepartment: params.userDepartment,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetLabel: params.targetLabel,
      periodKey: params.periodKey,
      department: params.department,
      description: params.description,
      diffs: params.diffs && params.diffs.length > 0 ? params.diffs : undefined,
    };

    const logRef = ref(db, `${AUDIT_LOGS_PATH}/${id}`);
    await set(logRef, entry);

    return id;
  } catch (err) {
    console.error('[auditLogService] Failed to record audit log:', err);
    return '';
  }
}

/**
 * Lắng nghe danh sách audit logs mới nhất (realtime)
 * @param callback Callback nhận danh sách log đã sắp xếp (mới nhất lên đầu)
 * @param maxRecords Số lượng bản ghi tối đa lấy về (mặc định 150)
 */
export function subscribeAuditLogs(
  callback: (logs: AuditLogEntry[]) => void,
  maxRecords: number = 150
): () => void {
  try {
    const logsRef = ref(db, AUDIT_LOGS_PATH);
    const logsQuery = query(logsRef, limitToLast(maxRecords));

    const unsub = onValue(
      logsQuery,
      (snapshot) => {
        const val = snapshot.val();
        if (!val || typeof val !== 'object') {
          callback([]);
          return;
        }

        const entries: AuditLogEntry[] = Object.values(val);
        // Sắp xếp giảm dần theo thời gian (mới nhất lên đầu)
        entries.sort((a, b) => {
          const tA = new Date(a.timestamp).getTime();
          const tB = new Date(b.timestamp).getTime();
          return tB - tA;
        });

        callback(entries);
      },
      (err) => {
        console.error('[auditLogService] Error subscribing to audit logs:', err);
        callback([]);
      }
    );

    return () => unsub();
  } catch (err) {
    console.error('[auditLogService] Subscription setup failed:', err);
    callback([]);
    return () => {};
  }
}

/**
 * Bản đồ nhãn tiếng Việt cho các trường dữ liệu phẫu thuật
 */
const SURGERY_FIELD_LABELS: Record<string, string> = {
  patientName: 'Tên bệnh nhân',
  patientId: 'Mã bệnh nhân',
  ptv: 'Phẫu thuật viên (PTV)',
  ptvSub: 'Phụ mổ (PTV Phụ)',
  bsgm: 'Bác sĩ gây mê (BSGM)',
  ktvgm: 'KTV Gây mê (KTVGM)',
  gv: 'Người giúp việc (GV)',
  tenDV: 'Tên kỹ thuật phẫu thuật',
  maDV: 'Mã kỹ thuật (Mã DV)',
  loaiPTTT: 'Phân loại PT/TT',
  ngayBD: 'Thời gian bắt đầu',
  ngayKT: 'Thời gian kết thúc',
  timeMinutes: 'Thời gian mổ (phút)',
  soLuong: 'Số lượng',
  donGia: 'Đơn giá',
  thanhTien: 'Thành tiền',
  machineName: 'Tên máy',
  machineCode: 'Mã máy',
};

/**
 * Tự động tính toán và so sánh các trường bị thay đổi giữa bản ghi cũ và mới
 */
export function computeSurgeryRecordDiff(
  oldRec: Partial<SurgeryRecord>,
  newRec: Partial<SurgeryRecord>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const monitoredKeys = Object.keys(SURGERY_FIELD_LABELS) as (keyof SurgeryRecord)[];

  for (const key of monitoredKeys) {
    const oldVal = (oldRec as any)?.[key];
    const newVal = (newRec as any)?.[key];

    // Chuẩn hóa so sánh chuỗi hoặc số
    const strOld = oldVal === null || oldVal === undefined ? '' : String(oldVal).trim();
    const strNew = newVal === null || newVal === undefined ? '' : String(newVal).trim();

    if (strOld !== strNew) {
      diffs.push({
        fieldKey: key as string,
        fieldLabel: SURGERY_FIELD_LABELS[key as string] || (key as string),
        before: oldVal ?? '',
        after: newVal ?? '',
      });
    }
  }

  return diffs;
}

/**
 * Lọc danh sách audit log theo điều kiện
 */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  filters: AuditFilterParams
): AuditLogEntry[] {
  return logs.filter((log) => {
    // 1. Lọc theo kỳ
    if (filters.periodKey && log.periodKey && log.periodKey !== filters.periodKey) {
      return false;
    }

    // 2. Lọc theo khoa (nếu có)
    if (filters.department && filters.department !== 'ALL') {
      if (log.department && log.department !== 'ALL' && log.department !== filters.department) {
        return false;
      }
    }

    // 3. Lọc theo loại hành động
    if (filters.action && filters.action !== 'ALL' && log.action !== filters.action) {
      return false;
    }

    // 4. Lọc theo từ khóa tìm kiếm
    if (filters.searchTerm && filters.searchTerm.trim() !== '') {
      const q = filters.searchTerm.toLowerCase().trim();
      const matchDesc = log.description?.toLowerCase().includes(q);
      const matchUser = log.userName?.toLowerCase().includes(q);
      const matchTarget = log.targetLabel?.toLowerCase().includes(q);
      const matchDept = log.department?.toLowerCase().includes(q);
      if (!matchDesc && !matchUser && !matchTarget && !matchDept) {
        return false;
      }
    }

    return true;
  });
}
