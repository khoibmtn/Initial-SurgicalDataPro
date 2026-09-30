import { getTimeRuleForRecord } from '../services/laborConfigService';
import type { ColumnDef } from '../components/common/DynamicTable';

// --- Helper: Vietnamese Tone Stripping ---
export const removeVietnameseTones = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

// --- Helper: Sequential Search Logic ---
export const matchSearchQuery = (
  row: any,
  query: string,
  searchableCols: Record<string, boolean> | undefined,
  columns: ColumnDef<any>[],
  timeRules?: any,
  timeItemsList?: any
): boolean => {
  if (!query) return true;
  const rawQuery = query.trim();
  const words = rawQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const regexStr = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  const wordsNoTones = words.map(w => removeVietnameseTones(w));
  const regexStrNoTones = wordsNoTones.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');

  let regex: RegExp;
  let regexNoTones: RegExp;
  try {
    regex = new RegExp(regexStr, 'i');
    regexNoTones = new RegExp(regexStrNoTones, 'i');
  } catch (e) {
    return true;
  }

  return columns.some(col => {
    if (searchableCols && searchableCols[col.key] === false) return false;

    let value = '';

    if (col.key === 'reason') {
      const minRule = getTimeRuleForRecord(row.loaiPTTT, row.ngayBD || row.start, timeItemsList, timeRules)?.min;
      value = (minRule && row.timeMinutes < minRule) ? `< ${minRule}p` : '';
    } else if (col.render) {
      const rendered = col.render(row);
      if (typeof rendered === 'string') {
        value = rendered;
      } else if (typeof rendered === 'number') {
        value = String(rendered);
      } else {
        value = String(row[col.key] || '');
      }
    } else {
      value = String(row[col.key] || '');
    }

    if (!value) return false;
    return regex.test(value) || regexNoTones.test(removeVietnameseTones(value));
  });
};
