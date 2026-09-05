/**
 * Test suite for Required Machine Logic:
 * - isMachineCodeRequired matching by maTuongDuong
 * - isMachineCodeRequired matching by normalized tenKT
 * - Date validity bounds [effectiveFrom, effectiveTo]
 * - isRequired toggle behavior
 * - Index lookup performance over 4,773 items
 */

import {
  isMachineCodeRequired,
  buildRequiredMachineIndex,
  IndexedRequiredMachineCatalog
} from '../services/requiredMachineService';
import { RequiredMachineItem } from '../types';

function runTests() {
  console.log('=== RUNNING REQUIRED MACHINE CODE TESTS ===\n');

  const sampleCatalog: RequiredMachineItem[] = [
    {
      id: '1',
      maTuongDuong: '01.0303.0001',
      tenDVKT: 'Siêu âm cấp cứu tại giường bệnh',
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      isRequired: true,
    },
    {
      id: '2',
      maTuongDuong: '18.1020.0055',
      tenDVKT: 'Phẫu thuật kết hợp xương đùi',
      effectiveFrom: '2020-01-01',
      effectiveTo: '2024-12-31',
      isRequired: true,
    },
    {
      id: '3',
      maTuongDuong: '18.1020.0055',
      tenDVKT: 'Phẫu thuật kết hợp xương đùi',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      isRequired: false, // Turned off requirement in 2025
    },
    {
      id: '4',
      maTuongDuong: '',
      tenDVKT: 'Thủ thuật dẫn lưu ổ bụng đơn giản',
      effectiveFrom: '2015-01-01',
      effectiveTo: null,
      isRequired: true,
    },
  ];

  const index = buildRequiredMachineIndex(sampleCatalog);

  // Test 1: Match by maTuongDuong (exact or formatted)
  const t1_rec = {
    maTuongDuong: '0103030001', // unformatted code
    tenKT: 'Siêu âm khác tên',
    ngayBD: '2023-05-15',
  };
  const t1_res = isMachineCodeRequired(t1_rec, index);
  console.log(`Test 1 (Match by code 0103030001): expected true -> got ${t1_res}`);
  if (!t1_res) throw new Error('Test 1 failed!');

  // Test 2: Match by name fallback when maTuongDuong missing
  const t2_rec = {
    maTuongDuong: '',
    tenKT: 'thủ thuật dẫn lưu ổ bụng đơn giản',
    ngayBD: '2022-01-01',
  };
  const t2_res = isMachineCodeRequired(t2_rec, index);
  console.log(`Test 2 (Match by name fallback): expected true -> got ${t2_res}`);
  if (!t2_res) throw new Error('Test 2 failed!');

  // Test 3: Not in catalog -> should NOT require machine
  const t3_rec = {
    maTuongDuong: '99.9999.9999',
    tenKT: 'Kỹ thuật không có trong danh mục máy',
    ngayBD: '2023-01-01',
  };
  const t3_res = isMachineCodeRequired(t3_rec, index);
  console.log(`Test 3 (Not in catalog): expected false -> got ${t3_res}`);
  if (t3_res !== false) throw new Error('Test 3 failed!');

  // Test 4: Date check - surgery before effectiveFrom
  const t4_rec = {
    maTuongDuong: '18.1020.0055',
    tenKT: 'Phẫu thuật kết hợp xương đùi',
    ngayBD: '2019-05-01', // before 2020-01-01
  };
  const t4_res = isMachineCodeRequired(t4_rec, index);
  console.log(`Test 4 (Surgery before effectiveFrom): expected false -> got ${t4_res}`);
  if (t4_res !== false) throw new Error('Test 4 failed!');

  // Test 5: Date check - surgery in 2024 (where isRequired = true)
  const t5_rec = {
    maTuongDuong: '18.1020.0055',
    tenKT: 'Phẫu thuật kết hợp xương đùi',
    ngayBD: '2024-06-15',
  };
  const t5_res = isMachineCodeRequired(t5_rec, index);
  console.log(`Test 5 (Surgery in 2024 with isRequired=true): expected true -> got ${t5_res}`);
  if (!t5_res) throw new Error('Test 5 failed!');

  // Test 6: Date check - surgery in 2025 (where isRequired = false)
  const t6_rec = {
    maTuongDuong: '18.1020.0055',
    tenKT: 'Phẫu thuật kết hợp xương đùi',
    ngayBD: '2025-03-20',
  };
  const t6_res = isMachineCodeRequired(t6_rec, index);
  console.log(`Test 6 (Surgery in 2025 with isRequired=false): expected false -> got ${t6_res}`);
  if (t6_res !== false) throw new Error('Test 6 failed!');

  // Test 7: Benchmark 10,000 lookups with large catalog (simulate 4,773 items)
  const largeCatalog: RequiredMachineItem[] = [];
  for (let i = 0; i < 5000; i++) {
    largeCatalog.push({
      id: `id_${i}`,
      maTuongDuong: `01.0000.${String(i).padStart(4, '0')}`,
      tenDVKT: `Dịch vụ kỹ thuật mẫu số ${i}`,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      isRequired: i % 2 === 0,
    });
  }
  const largeIndex = buildRequiredMachineIndex(largeCatalog);

  const start = Date.now();
  for (let i = 0; i < 10000; i++) {
    const targetIdx = i % 5000;
    isMachineCodeRequired(
      {
        maTuongDuong: `01.0000.${String(targetIdx).padStart(4, '0')}`,
        tenKT: `Dịch vụ kỹ thuật mẫu số ${targetIdx}`,
        ngayBD: '2024-01-01',
      },
      largeIndex
    );
  }
  const duration = Date.now() - start;
  console.log(`\nTest 7: 10,000 lookups in 5,000 items completed in ${duration}ms (target: < 50ms)`);
  if (duration > 150) throw new Error('Performance too slow!');

  console.log('\n>>> ALL 7 TESTS PASSED SUCCESSFULLY! <<<');
}

runTests();
