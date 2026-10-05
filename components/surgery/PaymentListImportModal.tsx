import React, { useEffect, useMemo, useState } from 'react';
import { X, Upload, Plus, AlertTriangle, FileSpreadsheet, Building2, CheckCircle2 } from 'lucide-react';
import { ParsedEntry, MatchStatus } from '../../types/paymentList';
import { PaymentListsContext } from '../../hooks/usePaymentLists';
import { parsePaymentListText, parsePaymentListFile } from '../../services/paymentListParser';
import { reconcileItems, findConflicts } from '../../services/paymentListReconcile';
import { createPaymentList, addItems, moveItem, updateItem } from '../../services/paymentListService';

interface Props {
  ctx: PaymentListsContext;
  /** Nếu có, nhập thêm vào đợt nháp này; nếu không, tạo đợt mới */
  targetListId?: string;
  onClose: () => void;
  onSuccess?: (listId: string) => void;
}

const STATUS_UI: Record<MatchStatus, { label: string; cls: string }> = {
  assigned: { label: 'Đã gán gói', cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Chưa gán gói', cls: 'bg-amber-100 text-amber-700' },
  notFound: { label: 'Không có trong dữ liệu', cls: 'bg-red-100 text-red-700' },
  nameMismatch: { label: 'Lệch họ tên', cls: 'bg-orange-100 text-orange-700' },
};

const defaultName = () => {
  const d = new Date();
  return `Đợt ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const PaymentListImportModal: React.FC<Props> = ({
  ctx,
  targetListId,
  onClose,
  onSuccess,
}) => {
  const { lists, allAssignments, records, membershipIndex } = ctx;
  const targetList = targetListId ? lists.find(l => l.id === targetListId) : undefined;

  const [name, setName] = useState(targetList?.name || defaultName());
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ entries: ParsedEntry[]; skipped: number } | null>(null);
  const [moveConflicts, setMoveConflicts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ctx.ensureRecordsLoaded().catch(e => console.error(e));
  }, []);

  const preview = useMemo(
    () =>
      parsed
        ? reconcileItems(
            parsed.entries.map(e => ({ ...e, addedAt: 0 })),
            { assignments: allAssignments, records },
          )
        : [],
    [parsed, allAssignments, records],
  );

  const conflicts = useMemo(
    () => (parsed ? findConflicts(parsed.entries, membershipIndex) : []),
    [parsed, membershipIndex],
  );

  // Thống kê theo Khoa nhận diện được
  const deptStats = useMemo(() => {
    if (!parsed) return [];
    const map = new Map<string, number>();
    for (const e of parsed.entries) {
      const d = e.department || 'Chưa phân khoa';
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [parsed]);

  const handleText = (v: string) => {
    setText(v);
    setParsed(v.trim() ? parsePaymentListText(v) : null);
  };

  const handleFile = async (f?: File) => {
    if (!f) return;
    try {
      const res = await parsePaymentListFile(f);
      setParsed(res);
    } catch (e: any) {
      setError(e?.message || 'Không thể đọc file Excel.');
    }
  };

  const handleExecute = async () => {
    if (!parsed || parsed.entries.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const conflictIds = new Set(conflicts.map(c => c.entry.patientId.trim()));
      const fresh = parsed.entries.filter(e => !conflictIds.has(e.patientId.trim()));

      let activeId = targetListId;

      if (!targetListId) {
        // Tạo đợt mới
        activeId = await createPaymentList({
          name: name.trim() || defaultName(),
          periodKey: ctx.periodKey,
          items: fresh,
          createdBy: ctx.userName,
        });
      } else {
        // Nhập thêm vào đợt hiện tại
        if (fresh.length > 0) {
          await addItems(targetListId, fresh);
        }
      }

      if (moveConflicts && activeId) {
        for (const c of conflicts) {
          if (c.list.status === 'draft' && c.list.listId !== activeId) {
            await moveItem(c.list.listId, activeId, c.entry.patientId.trim());
            await updateItem(activeId, c.entry.patientId.trim(), {
              patientName: c.entry.patientName,
              ...(c.entry.department ? { department: c.entry.department } : {}),
            });
          }
        }
      }

      onSuccess?.(activeId!);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Có lỗi khi lưu danh sách thanh toán.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-inter">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800">
                {targetList ? `Nhập thêm ca TCKT vào "${targetList.name}"` : 'Tạo đợt thanh toán gói dịch vụ mới'}
              </h2>
              <p className="text-[11px] text-gray-500">
                Tự động nhận diện mã KCB, họ tên và phân nhóm theo Khoa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {!targetList && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Tên đợt thanh toán
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Đợt thanh toán gói DV tháng 07/2026"
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Dán danh sách từ TCKT hoặc Tải file Excel
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 transition-colors">
                <Upload className="h-3 w-3" />
                <span>Tải file Excel (.xlsx)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => handleFile(e.target.files?.[0])}
                />
              </label>
            </div>
            <textarea
              value={text}
              onChange={e => handleText(e.target.value)}
              rows={8}
              placeholder={`Dán danh sách TCKT tại đây, hỗ trợ dòng phân tách Khoa:\n\n2600089956-MÙA THỊ TÁO\n2600089969-LÒ THỊ HỒNG ANH\nNgoại tổng hợp\n2600084085-VŨ THỊ NGUYÊN\n2600089383-HOÀNG VĂN HIỂU`}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/30 p-3 font-mono text-xs text-gray-700 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Live Preview Box */}
          {parsed && (
            <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/30 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-teal-900 text-sm">
                    {parsed.entries.length} ca hợp lệ
                  </span>
                  {parsed.skipped > 0 && (
                    <span className="text-gray-500 text-[11px]">
                      ({parsed.skipped} dòng tiêu đề/bỏ qua)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(STATUS_UI) as MatchStatus[]).map(s => {
                    const n = preview.filter(p => p.status === s).length;
                    return n > 0 ? (
                      <span key={s} className={`rounded-md px-2 py-0.5 font-semibold text-[11px] ${STATUS_UI[s].cls}`}>
                        {STATUS_UI[s].label}: {n}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Department breakdown pills */}
              {deptStats.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-bold text-gray-600 mb-1.5">
                    <Building2 className="h-3.5 w-3.5 text-teal-600" />
                    <span>Phân nhóm theo Khoa:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {deptStats.map(([dept, count]) => (
                      <span
                        key={dept}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-2xs"
                      >
                        <span className="font-semibold text-teal-700">{dept}:</span>
                        <span className="font-bold">{count} ca</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Conflicts notification */}
              {conflicts.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>{conflicts.length} ca đã nằm trong danh sách khác:</span>
                  </div>
                  <ul className="max-h-24 overflow-y-auto list-disc pl-5 text-[11px] space-y-0.5">
                    {conflicts.slice(0, 15).map(c => (
                      <li key={c.entry.patientId}>
                        <span className="font-mono font-semibold">{c.entry.patientId}</span> ({c.entry.patientName}) —{' '}
                        <span className="italic">{c.list.listName}</span>
                        {c.list.status === 'locked' && ' (🔒 Đã chốt)'}
                      </li>
                    ))}
                    {conflicts.length > 15 && <li>...và {conflicts.length - 15} ca khác</li>}
                  </ul>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-medium text-xs">
                    <input
                      type="checkbox"
                      checked={moveConflicts}
                      onChange={e => setMoveConflicts(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>Tự động chuyển các ca từ danh sách nháp sang đợt này</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            Hủy
          </button>
          <button
            disabled={busy || !parsed || parsed.entries.length === 0}
            onClick={handleExecute}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{targetList ? 'Nhập thêm vào đợt' : 'Tạo đợt thanh toán'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
