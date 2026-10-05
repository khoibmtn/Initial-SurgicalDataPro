import React, { useEffect, useMemo, useState } from 'react';
import { X, Upload, Lock, Unlock, Trash2, Plus, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { PaymentList, ParsedEntry, ReconciledItem, MatchStatus } from '../../types/paymentList';
import { PaymentListsContext, LookupRecord } from '../../hooks/usePaymentLists';
import { parsePaymentListText, parsePaymentListFile } from '../../services/paymentListParser';
import { reconcileItems, canLock, findConflicts } from '../../services/paymentListReconcile';
import {
  createPaymentList, addItems, updateItem, removeItem, moveItem,
  deletePaymentList, lockList, unlockList,
} from '../../services/paymentListService';
import { deleteAssignment } from '../../services/servicePackageService';

interface Props {
  ctx: PaymentListsContext;
  onClose: () => void;
  /** Opens the package-assign modal for one surgery record */
  onAssignPackage?: (records: any[]) => void;
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

function formatDischargeDate(dtStr?: string): string {
  if (!dtStr) return '';
  const d = dtStr.substring(0, 10).split('-');
  if (d.length === 3) return `${d[2]}/${d[1]}/${d[0]}`;
  return dtStr;
}

export const PaymentListManagerModal: React.FC<Props> = ({ ctx, onClose, onAssignPackage }) => {
  const { lists, allAssignments, records, membershipIndex } = ctx;
  const [activeId, setActiveId] = useState<string | 'new' | null>(lists[0]?.id ?? 'new');
  const [text, setText] = useState('');
  const [name, setName] = useState(defaultName());
  const [parsed, setParsed] = useState<{ entries: ParsedEntry[]; skipped: number } | null>(null);
  const [moveConflicts, setMoveConflicts] = useState(true);
  const [manual, setManual] = useState({ id: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ctx.ensureRecordsLoaded().catch(e => console.error(e)); }, []);

  const list: PaymentList | undefined = lists.find(l => l.id === activeId);
  const recon = useMemo(
    () => (list ? reconcileItems(list.items, { assignments: allAssignments, records }) : []),
    [list, allAssignments, records],
  );
  const preview = useMemo(
    () => (parsed
      ? reconcileItems(
          parsed.entries.map(e => ({ ...e, addedAt: 0 })),
          { assignments: allAssignments, records },
        )
      : []),
    [parsed, allAssignments, records],
  );
  const conflicts = useMemo(
    () => (parsed ? findConflicts(parsed.entries, membershipIndex) : []),
    [parsed, membershipIndex],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e: any) { setError(e?.message || 'Có lỗi xảy ra.'); } finally { setBusy(false); }
  };

  const handleText = (v: string) => { setText(v); setParsed(v.trim() ? parsePaymentListText(v) : null); };
  const handleFile = async (f?: File) => { if (f) setParsed(await parsePaymentListFile(f)); };

  const handleCreate = () => run(async () => {
    if (!parsed) return;
    const conflictIds = new Set(conflicts.map(c => c.entry.patientId.trim()));
    const fresh = parsed.entries.filter(e => !conflictIds.has(e.patientId.trim()));
    const id = await createPaymentList({
      name: name.trim() || defaultName(), periodKey: ctx.periodKey, items: fresh, createdBy: ctx.userName,
    });
    if (moveConflicts) {
      for (const c of conflicts) {
        if (c.list.status === 'draft') {
          await moveItem(c.list.listId, id, c.entry.patientId.trim());
          await updateItem(id, c.entry.patientId.trim(), { patientName: c.entry.patientName });
        }
      }
    }
    setParsed(null); setText(''); setActiveId(id);
  });

  const handleAssign = (item: ReconciledItem) => {
    const rec: LookupRecord | undefined = records.find(r => (r.patientId || '').trim() === item.patientId.trim());
    if (!rec) return;
    onClose();
    onAssignPackage?.([rec]);
  };

  const handleUnassign = (item: ReconciledItem) => run(async () => {
    if (!window.confirm(`Xóa gán gói của ${item.patientName} (${item.patientId})?`)) return;
    for (const id of item.assignmentIds) await deleteAssignment(id);
  });

  const handleRemove = (item: ReconciledItem) => run(() => removeItem(list!.id, item.patientId));

  const handleMove = (item: ReconciledItem, toId: string) => run(() => moveItem(list!.id, toId, item.patientId));

  const handleAddManual = () => run(async () => {
    if (!manual.id.trim()) return;
    await addItems(list!.id, [{ patientId: manual.id.trim(), patientName: manual.name.trim(), addedManually: true }]);
    setManual({ id: '', name: '' });
  });

  const locked = list?.status === 'locked';
  const otherDrafts = lists.filter(l => l.id !== list?.id && l.status === 'draft');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-bold text-gray-800">Danh sách thanh toán gói dịch vụ</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="w-56 shrink-0 space-y-1 overflow-y-auto border-r p-2">
            <button
              onClick={() => setActiveId('new')}
              className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold ${activeId === 'new' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              <Plus className="h-3.5 w-3.5" /> Nhập danh sách mới
            </button>
            {lists.map(l => (
              <button
                key={l.id}
                onClick={() => setActiveId(l.id)}
                className={`flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-xs ${activeId === l.id ? 'bg-gray-200 font-semibold' : 'hover:bg-gray-100'}`}
              >
                <span className="truncate">{l.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-gray-500">
                  {l.items.length}{l.status === 'locked' && <Lock className="h-3 w-3 text-emerald-600" />}
                </span>
              </button>
            ))}
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="h-4 w-4" /> {error}
              </div>
            )}

            {activeId === 'new' && (
              <div className="space-y-3">
                <input
                  value={name} onChange={e => setName(e.target.value)} placeholder="Tên đợt thanh toán"
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                />
                <textarea
                  value={text} onChange={e => handleText(e.target.value)} rows={6}
                  placeholder={'Dán danh sách, mỗi dòng: mã KCB - HỌ TÊN\nVD: 2600123456 - NGUYỄN VĂN A'}
                  className="w-full rounded-md border px-3 py-2 font-mono text-xs"
                />
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">
                  <Upload className="h-3.5 w-3.5" /> Chọn file Excel
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                </label>

                {parsed && (
                  <div className="space-y-2 rounded-md border p-3 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-semibold">{parsed.entries.length} dòng hợp lệ</span>
                      {parsed.skipped > 0 && <span className="text-gray-500">({parsed.skipped} dòng bỏ qua)</span>}
                      {(Object.keys(STATUS_UI) as MatchStatus[]).map(s => {
                        const n = preview.filter(p => p.status === s).length;
                        return n ? <span key={s} className={`rounded px-1.5 py-0.5 ${STATUS_UI[s].cls}`}>{STATUS_UI[s].label}: {n}</span> : null;
                      })}
                    </div>
                    {conflicts.length > 0 && (
                      <div className="rounded bg-amber-50 p-2 text-amber-800">
                        <p className="font-semibold">{conflicts.length} ca đã nằm trong danh sách khác:</p>
                        <ul className="ml-4 list-disc">
                          {conflicts.slice(0, 10).map(c => (
                            <li key={c.entry.patientId}>{c.entry.patientId} — {c.list.listName}{c.list.status === 'locked' ? ' 🔒 (đã chốt, bỏ qua)' : ''}</li>
                          ))}
                        </ul>
                        <label className="mt-1 flex items-center gap-1">
                          <input type="checkbox" checked={moveConflicts} onChange={e => setMoveConflicts(e.target.checked)} />
                          Chuyển các ca nằm ở danh sách nháp sang danh sách mới
                        </label>
                      </div>
                    )}
                    <button
                      disabled={busy || !parsed.entries.length} onClick={handleCreate}
                      className="rounded-md bg-emerald-600 px-4 py-1.5 font-semibold text-white disabled:opacity-50"
                    >
                      Tạo danh sách
                    </button>
                  </div>
                )}
              </div>
            )}

            {list && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">{list.name}</h3>
                  <span className="text-xs text-gray-500">{list.items.length} ca</span>
                  {locked && <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"><Lock className="h-3 w-3" /> Đã chốt{list.lockedBy ? ` bởi ${list.lockedBy}` : ''}</span>}
                  <div className="ml-auto flex gap-2">
                    {ctx.canManage && !locked && (
                      <button
                        disabled={busy || !canLock(recon)}
                        title={canLock(recon) ? '' : 'Còn ca lệch họ tên chưa làm rõ'}
                        onClick={() => run(() => lockList(list.id, ctx.userName, canLock(recon)))}
                        className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Lock className="h-3.5 w-3.5" /> Chốt
                      </button>
                    )}
                    {ctx.canManage && locked && (
                      <button
                        disabled={busy} onClick={() => run(() => unlockList(list.id))}
                        className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50"
                      >
                        <Unlock className="h-3.5 w-3.5" /> Mở khóa
                      </button>
                    )}
                    {!locked && (
                      <button
                        disabled={busy}
                        onClick={() => window.confirm(`Xóa danh sách "${list.name}"?`) && run(async () => { await deletePaymentList(list.id); setActiveId('new'); })}
                        className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xóa DS
                      </button>
                    )}
                  </div>
                </div>

                {!locked && (
                  <div className="flex gap-2">
                    <input value={manual.id} onChange={e => setManual({ ...manual, id: e.target.value })} placeholder="Mã KCB" className="w-36 rounded-md border px-2 py-1 text-xs" />
                    <input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} placeholder="Họ tên" className="w-52 rounded-md border px-2 py-1 text-xs" />
                    <button disabled={busy} onClick={handleAddManual} className="rounded-md border px-3 py-1 text-xs font-semibold hover:bg-gray-50">Thêm ca</button>
                  </div>
                )}

                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2">Mã KCB</th>
                      <th className="px-2">Họ tên (TCKT)</th>
                      <th className="px-2">Ra viện (BQ)</th>
                      <th className="px-2">Trạng thái</th>
                      <th className="px-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon.map((it, idx) => (
                      <tr key={it.patientId} className="border-b align-top">
                        <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                        <td className="px-2 font-mono">{it.patientId}</td>
                        <td className="px-2">
                          {it.patientName}
                          {it.status === 'nameMismatch' && <div className="text-orange-600">Hệ thống: {it.systemName}</div>}
                        </td>
                        <td className="px-2 font-mono text-[11px] whitespace-nowrap">
                          {ctx.discharge[it.patientId.trim()] ? (
                            <div className="flex flex-col">
                              <span className="text-emerald-700 font-semibold">
                                {formatDischargeDate(ctx.discharge[it.patientId.trim()].ngayRa)}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                QT: T{ctx.discharge[it.patientId.trim()].thangQt}/{ctx.discharge[it.patientId.trim()].namQt}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Mặc định</span>
                          )}
                        </td>
                        <td className="px-2"><span className={`rounded px-1.5 py-0.5 ${STATUS_UI[it.status].cls}`}>{STATUS_UI[it.status].label}</span></td>
                        <td className="px-2">
                          {!locked && (
                            <div className="flex flex-wrap items-center gap-1">
                              {it.status === 'pending' && <button onClick={() => handleAssign(it)} className="rounded border px-1.5 py-0.5 hover:bg-gray-50">Gán gói</button>}
                              {it.status === 'nameMismatch' && (
                                <>
                                  <button onClick={() => run(() => updateItem(list.id, it.patientId, { nameConfirmed: true }))} className="rounded border px-1.5 py-0.5 hover:bg-gray-50">Giữ ca</button>
                                  <button onClick={() => run(() => updateItem(list.id, it.patientId, { patientName: it.systemName || it.patientName }))} className="rounded border px-1.5 py-0.5 hover:bg-gray-50">Sửa tên</button>
                                </>
                              )}
                              {it.status === 'assigned' && <button onClick={() => handleUnassign(it)} className="rounded border px-1.5 py-0.5 hover:bg-gray-50">Xóa gán</button>}
                              {otherDrafts.length > 0 && (
                                <select
                                  value="" onChange={e => e.target.value && handleMove(it, e.target.value)}
                                  className="rounded border px-1 py-0.5" aria-label="Chuyển sang danh sách"
                                >
                                  <option value="">Chuyển sang…</option>
                                  {otherDrafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              )}
                              <button onClick={() => handleRemove(it)} className="rounded border border-red-200 px-1.5 py-0.5 text-red-600 hover:bg-red-50">
                                {it.status === 'pending' ? 'Loại khỏi DS' : 'Xóa khỏi DS'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {otherDrafts.length > 0 && !locked && (
                  <p className="flex items-center gap-1 text-[11px] text-gray-400"><ArrowRightLeft className="h-3 w-3" /> Mỗi ca chỉ nằm trong một danh sách.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
