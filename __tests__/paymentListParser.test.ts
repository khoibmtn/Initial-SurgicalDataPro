import { describe, it, expect } from 'vitest';
import { parsePaymentListText } from '../services/paymentListParser';

describe('parsePaymentListText', () => {
  it('parses "mã-HỌ TÊN" lines and ignores headers/numbers', () => {
    const text = [
      'Khoa Sản\t46,000,000',
      '1\t2600089966-MÙA THỊ TÁO\t2,000,000',
      '2600089969-LÔ THỊ HỒNG ANH',
      'Khoa Ngoại tổng hợp',
      '  2600084085 – VŨ THỊ NGUYÊN  ',
    ].join('\n');
    const { entries, skipped } = parsePaymentListText(text);
    expect(entries).toEqual([
      { patientId: '2600089966', patientName: 'MÙA THỊ TÁO', department: 'Khoa Sản' },
      { patientId: '2600089969', patientName: 'LÔ THỊ HỒNG ANH', department: 'Khoa Sản' },
      { patientId: '2600084085', patientName: 'VŨ THỊ NGUYÊN', department: 'Khoa Ngoại tổng hợp' },
    ]);
    expect(skipped).toBe(2);
  });

  it('correctly parses plain list separated by department headers like user TCKT format', () => {
    const text = [
      '2600089956-MÙA THỊ TÁO',
      '2600089969-LÒ THỊ HỒNG ANH',
      'Ngoại tổng hợp',
      '2600084085-VŨ THỊ NGUYÊN',
      '2600089383-HOÀNG VĂN HIỂU',
    ].join('\n');
    const { entries, skipped } = parsePaymentListText(text);
    expect(entries).toEqual([
      { patientId: '2600089956', patientName: 'MÙA THỊ TÁO' },
      { patientId: '2600089969', patientName: 'LÒ THỊ HỒNG ANH' },
      { patientId: '2600084085', patientName: 'VŨ THỊ NGUYÊN', department: 'Ngoại tổng hợp' },
      { patientId: '2600089383', patientName: 'HOÀNG VĂN HIỂU', department: 'Ngoại tổng hợp' },
    ]);
    expect(skipped).toBe(1);
  });

  it('deduplicates by patientId keeping the first', () => {
    const { entries } = parsePaymentListText('2600089966-A\n2600089966-B');
    expect(entries).toHaveLength(1);
    expect(entries[0].patientName).toBe('A');
  });
});
