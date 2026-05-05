/**
 * Chapter Catalog Service
 * CRUD + import/export + default seed for chapter catalog (danh mục chương)
 * Firebase RTDB flat structure: 1 record = ma_chuong + ten_chuong
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { ChapterCatalog } from '../types';

const CHAPTER_CATALOG_PATH = 'chapter_catalog';

// --- Default chapters ---
// ma_chuong = 2 ký tự text ("01"–"28"), ánh xạ với 2 ký tự đầu của maTuongDuong
// VD: maTuongDuong "24.0018.1611" → ma_chuong "24" → "Phẫu thuật Thận - tiết niệu"
const DEFAULT_CHAPTERS: Omit<ChapterCatalog, 'id' | 'createdAt'>[] = [
  { ma_chuong: '01', ten_chuong: 'Bệnh nhiễm trùng và ký sinh trùng' },
  { ma_chuong: '02', ten_chuong: 'Bướu tân sinh (U)' },
  { ma_chuong: '03', ten_chuong: 'Bệnh của máu, cơ quan tạo máu và các rối loạn liên quan đến cơ chế miễn dịch' },
  { ma_chuong: '04', ten_chuong: 'Bệnh nội tiết, dinh dưỡng và chuyển hóa' },
  { ma_chuong: '05', ten_chuong: 'Rối loạn tâm thần và hành vi' },
  { ma_chuong: '06', ten_chuong: 'Bệnh hệ thần kinh' },
  { ma_chuong: '07', ten_chuong: 'Bệnh mắt và phần phụ' },
  { ma_chuong: '08', ten_chuong: 'Bệnh tai và xương chũm' },
  { ma_chuong: '09', ten_chuong: 'Bệnh hệ tuần hoàn' },
  { ma_chuong: '10', ten_chuong: 'Bệnh hệ hô hấp' },
  { ma_chuong: '11', ten_chuong: 'Bệnh hệ tiêu hóa' },
  { ma_chuong: '12', ten_chuong: 'Bệnh da và mô dưới da' },
  { ma_chuong: '13', ten_chuong: 'Bệnh hệ cơ xương khớp và mô liên kết' },
  { ma_chuong: '14', ten_chuong: 'Bệnh hệ sinh dục - tiết niệu' },
  { ma_chuong: '15', ten_chuong: 'Thai nghén, sinh đẻ và hậu sản' },
  { ma_chuong: '16', ten_chuong: 'Một số bệnh lý xuất phát trong thời kỳ chu sinh' },
  { ma_chuong: '17', ten_chuong: 'Dị tật bẩm sinh, biến dạng và bất thường nhiễm sắc thể' },
  { ma_chuong: '18', ten_chuong: 'Triệu chứng, dấu hiệu và những phát hiện lâm sàng, cận lâm sàng bất thường' },
  { ma_chuong: '19', ten_chuong: 'Vết thương, ngộ độc và hậu quả của một số nguyên nhân bên ngoài' },
  { ma_chuong: '20', ten_chuong: 'Các nguyên nhân ngoại sinh của bệnh tật và tử vong' },
  { ma_chuong: '21', ten_chuong: 'Các yếu tố ảnh hưởng đến tình trạng sức khỏe và tiếp xúc dịch vụ y tế' },
  { ma_chuong: '22', ten_chuong: 'Phẫu thuật Thần kinh' },
  { ma_chuong: '23', ten_chuong: 'Phẫu thuật Nội tiết' },
  { ma_chuong: '24', ten_chuong: 'Phẫu thuật Mắt' },
  { ma_chuong: '25', ten_chuong: 'Phẫu thuật Tai Mũi Họng' },
  { ma_chuong: '26', ten_chuong: 'Phẫu thuật Hàm mặt và Răng miệng' },
  { ma_chuong: '27', ten_chuong: 'Phẫu thuật Tim mạch' },
  { ma_chuong: '28', ten_chuong: 'Phẫu thuật Hô hấp' },
];

// --- Realtime Subscription ---

export function subscribeToChapterCatalog(
  callback: (chapters: ChapterCatalog[]) => void
): () => void {
  const catalogRef = ref(db, CHAPTER_CATALOG_PATH);
  const unsubscribe = onValue(catalogRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const chapters: ChapterCatalog[] = Object.entries(data).map(([key, val]: [string, any]) => ({
      id: key,
      ma_chuong: val.ma_chuong || '',
      ten_chuong: val.ten_chuong || '',
      createdAt: val.createdAt || 0,
    }));

    // Sort by ma_chuong text ("01" < "02" < ... < "28")
    chapters.sort((a, b) => a.ma_chuong.localeCompare(b.ma_chuong, 'vi'));

    callback(chapters);
  });

  return unsubscribe;
}

// --- CRUD ---

export async function createChapter(
  data: Omit<ChapterCatalog, 'id' | 'createdAt'>
): Promise<string> {
  const catalogRef = ref(db, CHAPTER_CATALOG_PATH);
  const newRef = push(catalogRef);
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key!;
}

export async function updateChapter(
  id: string,
  updates: Partial<Omit<ChapterCatalog, 'id' | 'createdAt'>>
): Promise<void> {
  const chapterRef = ref(db, `${CHAPTER_CATALOG_PATH}/${id}`);
  await update(chapterRef, updates);
}

export async function deleteChapter(id: string): Promise<void> {
  const chapterRef = ref(db, `${CHAPTER_CATALOG_PATH}/${id}`);
  await remove(chapterRef);
}

export async function bulkDeleteChapters(ids: string[]): Promise<number> {
  const batchSize = 50;
  let deleted = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const updates: Record<string, any> = {};
    for (const id of batch) {
      updates[`${CHAPTER_CATALOG_PATH}/${id}`] = null;
    }
    await update(ref(db), updates);
    deleted += batch.length;
  }

  return deleted;
}

// --- Seed Default Chapters ---

export async function seedDefaultChapters(
  existingChapters: ChapterCatalog[]
): Promise<{ added: number; skipped: number }> {
  const existingCodes = new Set(existingChapters.map(c => c.ma_chuong.toUpperCase()));

  const toAdd = DEFAULT_CHAPTERS.filter(
    c => !existingCodes.has(c.ma_chuong.toUpperCase())
  );

  if (toAdd.length === 0) {
    return { added: 0, skipped: DEFAULT_CHAPTERS.length };
  }

  const updates: Record<string, any> = {};
  for (const item of toAdd) {
    const newRef = push(ref(db, CHAPTER_CATALOG_PATH));
    updates[`${CHAPTER_CATALOG_PATH}/${newRef.key}`] = {
      ...item,
      createdAt: Date.now(),
    };
  }

  await update(ref(db), updates);
  return { added: toAdd.length, skipped: DEFAULT_CHAPTERS.length - toAdd.length };
}

// --- Bulk Upsert ---

export async function bulkUpsertChapters(
  items: Omit<ChapterCatalog, 'id' | 'createdAt'>[],
  existingChapters: ChapterCatalog[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const existingMap = new Map<string, string>();
  for (const c of existingChapters) {
    existingMap.set(c.ma_chuong.toUpperCase(), c.id);
  }

  const batchSize = 50;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const updates: Record<string, any> = {};

    for (const item of batch) {
      const existingId = existingMap.get(item.ma_chuong.toUpperCase());

      if (existingId) {
        updates[`${CHAPTER_CATALOG_PATH}/${existingId}/ten_chuong`] = item.ten_chuong;
        updated++;
      } else {
        const newRef = push(ref(db, CHAPTER_CATALOG_PATH));
        updates[`${CHAPTER_CATALOG_PATH}/${newRef.key}`] = {
          ...item,
          createdAt: Date.now(),
        };
        created++;
      }
    }

    await update(ref(db), updates);
  }

  return { created, updated };
}

// --- Excel Export ---

export function exportChapters(chapters: ChapterCatalog[]): void {
  const wb = XLSX.utils.book_new();

  const rows = chapters.map(c => [c.ma_chuong, c.ten_chuong]);

  const data = [
    ['Mã chương', 'Tên chương'],
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 60 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Danh mục chương');
  XLSX.writeFile(wb, 'Danh_muc_chuong.xlsx');
}

export function exportChapterTemplate(): void {
  const wb = XLSX.utils.book_new();

  const data = [
    ['Mã chương', 'Tên chương'],
    ['01', 'Bệnh nhiễm trùng và ký sinh trùng'],
    ['22', 'Phẫu thuật Thần kinh'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 60 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mẫu nhập chương');
  XLSX.writeFile(wb, 'Mau_nhap_danh_muc_chuong.xlsx');
}

// --- Excel Import ---

export interface ImportedChapterData {
  items: Omit<ChapterCatalog, 'id' | 'createdAt'>[];
  errors: string[];
  warnings: string[];
}

export function parseImportedChapterExcel(workbook: XLSX.WorkBook): ImportedChapterData {
  const result: ImportedChapterData = { items: [], errors: [], warnings: [] };

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    result.errors.push('File Excel không có sheet nào');
    return result;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  if (rows.length < 2) {
    result.errors.push('File cần ít nhất 1 dòng dữ liệu (sau header)');
    return result;
  }

  const seenCodes = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || (!row[0] && !row[1])) continue;

    const ma_chuong = String(row[0] || '').trim();
    const ten_chuong = String(row[1] || '').trim();

    if (!ma_chuong) {
      result.warnings.push(`Dòng ${i + 1}: Bỏ qua (thiếu mã chương)`);
      continue;
    }

    if (!ten_chuong) {
      result.errors.push(`Dòng ${i + 1} "${ma_chuong}": Thiếu tên chương`);
      continue;
    }

    if (seenCodes.has(ma_chuong.toUpperCase())) {
      result.warnings.push(`Dòng ${i + 1}: Mã chương "${ma_chuong}" bị trùng — dùng bản ghi cuối`);
    }
    seenCodes.add(ma_chuong.toUpperCase());

    result.items.push({ ma_chuong, ten_chuong });
  }

  if (result.items.length === 0 && result.errors.length === 0) {
    result.errors.push('Không tìm thấy dữ liệu hợp lệ trong file');
  }

  return result;
}
