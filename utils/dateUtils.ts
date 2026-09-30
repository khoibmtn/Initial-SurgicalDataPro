import { format, parse, isValid } from 'date-fns';

export const parseDateString = (val: any): Date | null => {
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return null;
  const formats = [
    'dd/MM/yyyy',
    'dd/MM/yyyy HH:mm',
    'MM/dd/yyyy',
    'yyyy-MM-dd',
    "yyyy-MM-dd'T'HH:mm:ss.SSSX",
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss"
  ];
  for (const f of formats) {
    const d = parse(val, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
};

export const formatDate = (val: any, fmt: string): string => {
  try {
    const date = parseDateString(val);
    if (!date) return typeof val === 'string' ? val : '-';
    const tokenMap: Record<string, string> = {
      'dd/mm/yyyy': 'dd/MM/yyyy',
      'dd/mm/yyyy hh:mm': 'dd/MM/yyyy HH:mm',
      'dd/mm hh:mm': 'dd/MM HH:mm',
      'hh:mm': 'HH:mm'
    };
    const f = tokenMap[fmt] || 'dd/MM/yyyy HH:mm';
    return format(date, f);
  } catch {
    return '-';
  }
};
