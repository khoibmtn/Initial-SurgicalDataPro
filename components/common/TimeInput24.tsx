import React, { useEffect, useState } from 'react';

interface TimeInput24Props {
  id?: string;
  /** "HH:mm" (24h) */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Chuẩn hoá chuỗi gõ tay → "HH:mm" 24h, hoặc null nếu không hợp lệ. Nhận "8", "801", "0801", "8:1", "13h05". */
export function parseTime24(raw: string): string | null {
  const s = raw.trim();
  let h: number;
  let m: number;
  const sep = s.match(/^(\d{1,2})\s*[:hH.]\s*(\d{0,2})$/);
  if (sep) {
    h = Number(sep[1]);
    m = sep[2] ? Number(sep[2]) : 0;
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) { h = Number(s); m = 0; }
    else { h = Number(s.slice(0, s.length - 2)); m = Number(s.slice(-2)); }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

function stepTime(value: string, deltaMins: number): string {
  const [h, m] = value.split(':').map(Number);
  const total = ((((h || 0) * 60 + (m || 0) + deltaMins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Ô nhập giờ luôn hiển thị dạng 24h (13:00, không phải 01:00 PM),
 * không phụ thuộc locale của trình duyệt/hệ điều hành như <input type="time">.
 * ↑/↓ tăng giảm 1 phút (giữ Shift: 15 phút).
 */
export const TimeInput24: React.FC<TimeInput24Props> = ({ id, value, onChange, disabled, className, ...rest }) => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = (text: string) => {
    const parsed = parseTime24(text);
    if (parsed) {
      setDraft(parsed);
      if (parsed !== value) onChange(parsed);
    } else {
      setDraft(value);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value.replace(/[^\d:hH.]/g, '').slice(0, 5);
    // Tự chèn ":" sau 2 chữ số khi gõ liên tục (vd "13" → "13:")
    if (/^\d{3,4}$/.test(text)) text = `${text.slice(0, 2)}:${text.slice(2)}`;
    setDraft(text);
    const parsed = /^\d{1,2}[:hH.]\d{2}$/.test(text) ? parseTime24(text) : null;
    if (parsed && parsed !== value) onChange(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseTime24(draft) || value || '00:00';
      const next = stepTime(base, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 15 : 1));
      setDraft(next);
      onChange(next);
    } else if (e.key === 'Enter') {
      commit(draft);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:mm"
      maxLength={5}
      value={draft}
      disabled={disabled}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); commit(draft); }}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={className}
      title="Nhập giờ 24h, vd 13:05 (↑/↓ chỉnh từng phút, Shift + ↑/↓: 15 phút)"
      {...rest}
    />
  );
};
