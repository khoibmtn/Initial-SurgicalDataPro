import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Upload,
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  ListChecks,
  Info,
} from 'lucide-react';
import { ParsedEntry, MatchStatus } from '../../types/paymentList';
import { PaymentListsContext } from '../../hooks/usePaymentLists';
import { parsePaymentListText, parsePaymentListFile } from '../../services/paymentListParser';
import { reconcileItems } from '../../services/paymentListReconcile';
import { createPaymentList, addItems } from '../../services/paymentListService';

interface Props {
  ctx: PaymentListsContext;
  /** Nếu có, nhập thêm vào đợt nháp này; nếu không, tạo đợt mới */
  targetListId?: string;
  onClose: () => void;
  onSuccess?: (listId: string) => void;
}

const STATUS_UI: Record<MatchStatus, { label: string; cls: string }> = {
  assigned: { label: 'Đã gán gói', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  pending: { label: 'Chưa gán gói', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  notFound: { label: 'Không có trong dữ liệu', cls: 'bg-red-100 text-red-800 border border-red-200' },
  nameMismatch: { label: 'Lệch họ tên', cls: 'bg-orange-100 text-orange-800 border border-orange-200' },
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

  // Phân loại các ca trong danh sách import: Ca mới vs Đã có trong đợt này vs Đã có trong đợt khác
  const categorizedEntries = useMemo(() => {
    if (!parsed) return { brandNew: [], inCurrentList: [], inOtherList: [] };

    const brandNew: ParsedEntry[] = [];
    const inCurrentList: { entry: ParsedEntry; list: { listId: string; listName: string; status: string } }[] = [];
    const inOtherList: { entry: ParsedEntry; list: { listId: string; listName: string; status: string } }[] = [];

    for (const e of parsed.entries) {
      const p = (e.patientId || '').trim();
      const m = membershipIndex.get(p);
      if (!m) {
        brandNew.push(e);
      } else if (targetListId && m.listId === targetListId) {
        inCurrentList.push({ entry: e, list: m });
      } else {
        inOtherList.push({ entry: e, list: m });
      }
    }

    return { brandNew, inCurrentList, inOtherList };
  }, [parsed, membershipIndex, targetListId]);

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
    if (!parsed || categorizedEntries.brandNew.length === 0) return;
    setBusy(true);
    setError('');
    try {
      // Nghiệp vụ: Chỉ nhập những ca chưa có trong bất kỳ danh sách đợt thanh toán nào
      const fresh = categorizedEntries.brandNew;

      let activeId = targetListId;

      if (!targetListId) {
        // Tạo đợt mới với các ca mới
        activeId = await createPaymentList({
          name: name.trim() || defaultName(),
          periodKey: ctx.periodKey,
          items: fresh,
          createdBy: ctx.userName,
        });
      } else {
        // Nhập thêm vào đợt hiện tại: chỉ thêm các ca mới
        await addItems(targetListId, fresh, ctx.userName);
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
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800 shadow-xs border border-teal-200">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                {targetList ? `Nhập thêm ca TCKT vào "${targetList.name}"` : 'Tạo đợt thanh toán gói dịch vụ mới'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Tự động nhận diện mã KCB, họ tên, phân nhóm theo Khoa và kiểm tra đợt thanh toán
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
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
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Tên đợt thanh toán
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Đợt thanh toán gói DV tháng 07/2026"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Dán danh sách từ TCKT hoặc Tải file Excel
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-400 transition-colors">
                <Upload className="h-3 w-3 text-slate-600" />
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
              rows={6}
              placeholder={`Dán danh sách TCKT tại đây, hỗ trợ dòng phân tách Khoa:\n\n2600089956-MÙA THỊ TÁO\n2600089969-LÒ THỊ HỒNG ANH\nNgoại tổng hợp\n2600084085-VŨ THỊ NGUYÊN\n2600089383-HOÀNG VĂN HIỂU`}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
            />
          </div>

          {/* Live Preview Box */}
          {parsed && (
            <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50/60 p-3.5">
              {/* Header thống kê */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    {parsed.entries.length} ca hợp lệ
                  </span>
                  {parsed.skipped > 0 && (
                    <span className="text-slate-500 text-[11px]">
                      ({parsed.skipped} dòng tiêu đề/bỏ qua)
                    </span>
                  )}
                </div>

                {/* Badges phân loại đợt */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md px-2 py-0.5 font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ✨ Chưa vào đợt (Ca mới): {categorizedEntries.brandNew.length}
                  </span>
                  {targetList && categorizedEntries.inCurrentList.length > 0 && (
                    <span className="rounded-md px-2 py-0.5 font-bold text-[11px] bg-sky-100 text-sky-800 border border-sky-300">
                      📌 Đã có trong đợt này: {categorizedEntries.inCurrentList.length}
                    </span>
                  )}
                  {categorizedEntries.inOtherList.length > 0 && (
                    <span className="rounded-md px-2 py-0.5 font-bold text-[11px] bg-amber-100 text-amber-800 border border-amber-300">
                      ⚠️ Đã ở đợt khác: {categorizedEntries.inOtherList.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Status pills: Đã gán gói / Chưa gán gói */}
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

              {/* Department breakdown pills */}
              {deptStats.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1.5">
                    <Building2 className="h-3.5 w-3.5 text-teal-600" />
                    <span>Phân nhóm theo Khoa:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {deptStats.map(([dept, count]) => (
                      <span
                        key={dept}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs"
                      >
                        <span className="font-semibold text-teal-800">{dept}:</span>
                        <span className="font-bold text-slate-900">{count} ca</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* BẢNG CHI TIẾT CÁC CA HỢP LỆ VÀ ĐỢT THANH TOÁN TƯƠNG ỨNG */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4 text-teal-600" />
                    <span>Danh sách chi tiết ({preview.length} ca):</span>
                  </div>
                  <span className="text-slate-500 font-normal text-[10px]">
                    Hiển thị thông tin đợt thanh toán của từng ca
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold sticky top-0 z-10 text-[11px]">
                      <tr>
                        <th className="px-2.5 py-1.5 text-center w-8">#</th>
                        <th className="px-2.5 py-1.5 w-28">Mã KCB</th>
                        <th className="px-2.5 py-1.5 min-w-[140px]">Họ và tên</th>
                        <th className="px-2.5 py-1.5 w-32">Khoa</th>
                        <th className="px-2.5 py-1.5 w-32 text-center">Trạng thái gói DV</th>
                        <th className="px-2.5 py-1.5 min-w-[160px]">Đợt thanh toán</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {preview.map((p, idx) => {
                        const pidClean = (p.patientId || '').trim();
                        const membership = membershipIndex.get(pidClean);
                        const isCurrent = targetListId && membership?.listId === targetListId;

                        return (
                          <tr key={`${p.patientId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-2.5 py-1.5 text-center text-slate-400 font-mono text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono font-bold text-slate-800">
                              {p.patientId}
                            </td>
                            <td className="px-2.5 py-1.5 font-semibold text-slate-800">
                              {p.patientName}
                              {p.status === 'nameMismatch' && p.systemName && (
                                <span className="block text-[10px] text-amber-700 font-normal">
                                  (Phẫu thuật: {p.systemName})
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 text-slate-600 truncate">
                              {p.department || '—'}
                            </td>
                            <td className="px-2.5 py-1.5 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_UI[p.status].cls}`}>
                                {STATUS_UI[p.status].label}
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5">
                              {membership ? (
                                isCurrent ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-300 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 shadow-2xs">
                                    <span>📌</span>
                                    <span>{membership.listName} (Đợt này)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 shadow-2xs">
                                    <span>{membership.status === 'locked' ? '🔒' : '📝'}</span>
                                    <span>{membership.listName}</span>
                                    {membership.status === 'locked' && <span className="font-normal text-[9px]">(Đã chốt)</span>}
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
                                  <span>✨</span>
                                  <span>Chưa vào đợt (Ca mới)</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Thông báo nghiệp vụ */}
              {categorizedEntries.brandNew.length === 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Không có ca mới để thêm vào đợt</div>
                    <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                      Tất cả <strong>{parsed.entries.length} ca</strong> trong danh sách đã có trong các đợt thanh toán
                      {categorizedEntries.inCurrentList.length > 0 && ` (${categorizedEntries.inCurrentList.length} ca đã có sẵn trong đợt "${targetList?.name}")`}
                      {categorizedEntries.inOtherList.length > 0 && ` (${categorizedEntries.inOtherList.length} ca đã nằm ở đợt khác)`}.
                      Hệ thống chỉ nhập những ca chưa có trong bất kỳ đợt nào, do đó không thêm được.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3 text-teal-900 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      Phát hiện {categorizedEntries.brandNew.length} ca mới chưa có trong bất kỳ đợt nào
                    </div>
                    <p className="mt-0.5 text-[11px] text-teal-800 leading-relaxed">
                      Khi bấm nhập, hệ thống sẽ <strong>chỉ thêm {categorizedEntries.brandNew.length} ca mới này</strong> vào đợt.
                      {categorizedEntries.inCurrentList.length + categorizedEntries.inOtherList.length > 0 &&
                        ` Bỏ qua ${categorizedEntries.inCurrentList.length + categorizedEntries.inOtherList.length} ca đã có trong đợt thanh toán.`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs"
          >
            Hủy
          </button>
          <button
            disabled={busy || !parsed || categorizedEntries.brandNew.length === 0}
            onClick={handleExecute}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {targetList
                ? categorizedEntries.brandNew.length === 0
                  ? 'Không có ca mới để thêm'
                  : `Nhập thêm ${categorizedEntries.brandNew.length} ca mới vào đợt`
                : categorizedEntries.brandNew.length === 0
                  ? 'Không có ca mới để tạo đợt'
                  : `Tạo đợt mới (${categorizedEntries.brandNew.length} ca)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
