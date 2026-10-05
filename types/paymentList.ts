export type MatchStatus = 'assigned' | 'pending' | 'notFound' | 'nameMismatch';

/** Một dòng đọc được từ danh sách TCKT */
export interface ParsedEntry {
  patientId: string;
  patientName: string;
  department?: string;
}

export interface PaymentListItem {
  patientId: string;
  patientName: string; // tên theo danh sách TCKT
  department?: string; // khoa nhận diện từ danh sách TCKT
  note?: string;
  addedManually?: boolean;
  /** user đã xác nhận giữ ca dù lệch họ tên */
  nameConfirmed?: boolean;
  addedAt: number;
}

export interface PaymentList {
  id: string;
  name: string;
  periodKey: string; // YYYY-MM, chỉ để lọc/hiển thị
  status: 'draft' | 'locked';
  items: PaymentListItem[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  lockedBy?: string;
  lockedAt?: number;
}

/** Item kèm trạng thái đối soát (tính ở client, không lưu) */
export interface ReconciledItem extends PaymentListItem {
  status: MatchStatus;
  assignmentIds: string[];
  systemName?: string;
}
