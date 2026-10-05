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
      { patientId: '2600089966', patientName: 'MÙA THỊ TÁO' },
      { patientId: '2600089969', patientName: 'LÔ THỊ HỒNG ANH' },
      { patientId: '2600084085', patientName: 'VŨ THỊ NGUYÊN' },
    ]);
    expect(skipped).toBe(2);
  });

  it('deduplicates by patientId keeping the first', () => {
    const { entries } = parsePaymentListText('2600089966-A\n2600089966-B');
    expect(entries).toHaveLength(1);
    expect(entries[0].patientName).toBe('A');
  });
});
