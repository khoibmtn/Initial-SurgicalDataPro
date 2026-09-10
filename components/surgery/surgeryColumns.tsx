import React from 'react';
import { SurgeryRecord, StaffConflict, MachineConflict, AppConfig } from '../../types';
import { ColumnDef } from '../common/DynamicTable';
import { formatDate } from '../../utils/dateUtils';
import { getTimeRuleForRecord } from '../../services/laborConfigService';

export const ROLE_LABELS: Record<string, string> = {
  PT_CHINH: 'PT Chính',
  PT_PHU: 'PT Phụ',
  BS_GM: 'BS GM',
  KTV_GM: 'KTV GM',
  TDC: 'TDC',
  GV: 'GV',
};

export function buildColumnsList(dateFormat: string, config: AppConfig): ColumnDef<SurgeryRecord>[] {
  return [
    { key: 'stt', label: 'STT', align: 'center', defaultWidth: 42 },
    { key: 'patientId', label: 'Mã BN', defaultWidth: 72 },
    { key: 'patientName', label: 'Họ tên', defaultWidth: 130 },
    { key: 'gender', label: 'Giới', align: 'center', defaultWidth: 40 },
    { key: 'yob', label: 'Năm sinh', align: 'center', defaultWidth: 52 },
    { key: 'bhyt', label: 'Thẻ BHYT', defaultWidth: 110, defaultHidden: true },
    { key: 'ngayCD', label: 'Ngày CĐ', render: (r) => formatDate(r.ngayCD, dateFormat), defaultWidth: 100, defaultHidden: true },
    { key: 'ngayBD', label: 'Ngày BĐ', render: (r) => formatDate(r.ngayBD, dateFormat), defaultWidth: 100 },
    { key: 'ngayKT', label: 'Ngày KT', render: (r) => formatDate(r.ngayKT, dateFormat), defaultWidth: 100 },
    { key: 'tenKT', label: 'Tên kỹ thuật', defaultWidth: 220 },
    { key: 'loaiPTTT', label: 'Loại', align: 'center', defaultWidth: 42 },
    { key: 'soLuong', label: 'SL', align: 'center', defaultWidth: 34 },
    { key: 'timeMinutes', label: 'Phút', align: 'center', defaultWidth: 40 },
    { key: 'ptChinh', label: 'PT Chính', defaultWidth: 100 },
    { key: 'ptPhu', label: 'PT Phụ', defaultWidth: 100 },
    { key: 'bsGM', label: 'BS GM', defaultWidth: 100 },
    { key: 'ktvGM', label: 'KTV GM', defaultWidth: 100 },
    { key: 'tdc', label: 'TDC', defaultWidth: 100 },
    { key: 'gv', label: 'GV', defaultWidth: 100 },
    { key: 'machine', label: 'Tên máy', defaultWidth: 150 },
    { key: 'machineId', label: 'ID máy', defaultWidth: 50, defaultHidden: true },
    { key: 'machineCode', label: 'Mã máy', defaultWidth: 90, defaultHidden: true },
    {
      key: 'reason',
      label: 'Lỗi thời gian',
      render: (r) => {
        const min = getTimeRuleForRecord(r.loaiPTTT, r.ngayBD || r.start, config.timeItemsList, config.timeRules)?.min;
        if (min && r.timeMinutes < min) return <span className="font-bold">{`< ${min}p`}</span>;
        return null;
      },
      defaultWidth: 80,
    },
    {
      key: 'maTuongDuong',
      label: 'Mã tương đương',
      render: (r) =>
        r.maTuongDuong ? (
          <span className="font-mono text-blue-700 font-semibold">{r.maTuongDuong}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
      defaultWidth: 120,
    },
    {
      key: 'donGia',
      label: 'Đơn giá',
      align: 'right',
      render: (r) => (r.donGia ? r.donGia.toLocaleString('vi-VN') : <span className="text-gray-300">—</span>),
      defaultWidth: 100,
    },
    {
      key: 'thanhTien',
      label: 'Thành tiền',
      align: 'right',
      render: (r) =>
        r.thanhTien ? (
          <span className="font-bold text-emerald-700">{r.thanhTien.toLocaleString('vi-VN')}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
      defaultWidth: 110,
    },
  ];
}

export function buildColumnsMissing(columnsList: ColumnDef<SurgeryRecord>[]): ColumnDef<SurgeryRecord>[] {
  return columnsList.filter(
    (c) => c.key !== 'machine' && c.key !== 'machineId' && c.key !== 'machineCode' && c.key !== 'reason'
  );
}

export function buildColumnsStaff(dateFormat: string): ColumnDef<StaffConflict>[] {
  return [
    { key: 'stt', label: '#', align: 'center', defaultWidth: 40 },
    { key: 'staffName', label: 'Nhân viên trùng', render: (c) => c.staffName || '-', defaultWidth: 150, headerClassName: 'text-center' },
    { key: 'role', label: 'Vai trò', render: (c) => ROLE_LABELS[c.role] || c.role || '-', defaultWidth: 90, headerClassName: 'text-center' },

    // PATIENT 1 BLOCK (White/Default)
    { key: 'patientId1', label: 'Mã BN 1', render: (c) => c.patientId1 || '-', defaultWidth: 80, headerClassName: 'text-center' },
    { key: 'patientName1', label: 'Tên BN 1', render: (c) => c.patientName1 || '-', defaultWidth: 150, headerClassName: 'text-center' },
    { key: 'tenKT1', label: 'Tên KT 1', render: (c) => c.tenKT1 || '-', defaultWidth: 200, headerClassName: 'text-center' },
    { key: 'ptChinh1', label: 'PT Chính 1', render: (c) => c.rec1.ptChinh || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'ktvGM1', label: 'KTV GM 1', render: (c) => c.rec1.ktvGM || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'bsGM1', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'gv1', label: 'GV 1', render: (c) => c.rec1.gv || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), defaultWidth: 120, className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), defaultWidth: 120, className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), defaultWidth: 120, className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), defaultWidth: 120, className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientId2', label: 'Mã BN 2', render: (c) => c.patientId2 || '-', defaultWidth: 80, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientName2', label: 'Tên BN 2', render: (c) => c.patientName2 || '-', defaultWidth: 180, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tenKT2', label: 'Tên KT 2', render: (c) => c.tenKT2 || '-', defaultWidth: 250, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptChinh2', label: 'PT Chính 2', render: (c) => c.rec2.ptChinh || '-', defaultWidth: 100, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', defaultWidth: 140, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', defaultWidth: 140, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ktvGM2', label: 'KTV GM 2', render: (c) => c.rec2.ktvGM || '-', defaultWidth: 140, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', defaultWidth: 140, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'gv2', label: 'GV 2', render: (c) => c.rec2.gv || '-', defaultWidth: 140, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
  ];
}

export function buildColumnsMachine(dateFormat: string): ColumnDef<MachineConflict>[] {
  return [
    { key: 'stt', label: '#', align: 'center', defaultWidth: 40 },
    { key: 'machine', label: 'Máy trùng', render: (c) => c.machine || '-', defaultWidth: 200, headerClassName: 'text-center' },

    // PATIENT 1 BLOCK - Red text for time columns
    { key: 'patientId1', label: 'Mã BN 1', render: (c) => c.patientId1 || '-', defaultWidth: 80, headerClassName: 'text-center' },
    { key: 'patientName1', label: 'Tên BN 1', render: (c) => c.patientName1 || '-', defaultWidth: 150, headerClassName: 'text-center' },
    { key: 'tenKT1', label: 'Tên KT 1', render: (c) => c.tenKT1 || '-', defaultWidth: 200, headerClassName: 'text-center' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'bsgm1', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', defaultWidth: 100, headerClassName: 'text-center' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), defaultWidth: 120, className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), defaultWidth: 120, className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), defaultWidth: 120, className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), defaultWidth: 120, className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientId2', label: 'Mã BN 2', render: (c) => c.patientId2 || '-', defaultWidth: 80, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientName2', label: 'Tên BN 2', render: (c) => c.patientName2 || '-', defaultWidth: 150, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tenKT2', label: 'Tên KT 2', render: (c) => c.tenKT2 || '-', defaultWidth: 200, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', defaultWidth: 100, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', defaultWidth: 100, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', defaultWidth: 100, className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
  ];
}
