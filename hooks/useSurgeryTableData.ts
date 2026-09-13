import { useState, useMemo, useEffect, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import {
  SurgeryRecord,
  StaffConflict,
  MachineConflict,
  SurgeryConfig,
  StaffMember,
  ProcessingResult,
} from '../types';
import { ReportState } from '../types/reportState';
import { ToastType } from '../components/common/ToastContainer';
import { ColumnDef } from '../components/common/DynamicTable';
import { getTimeRuleForRecord } from '../services/laborConfigService';
import { recalculateResultFromRecords } from '../services/reprocess';
import { reportService } from '../services/reportService';
import { matchSearchQuery } from '../utils/tableSearchUtils';
import {
  buildColumnsList,
  buildColumnsMissing,
  buildColumnsStaff,
  buildColumnsMachine,
} from '../components/surgery/surgeryColumns';
import { getPaymentColumns as buildPaymentColumns } from '../components/surgery/PaymentTableView';

export interface UseSurgeryTableDataOptions {
  config: SurgeryConfig;
  dateFormat: string;
  rowsPerPage: number;
  visibleCols: Record<string, any>;
  searchableCols: Record<string, Record<string, boolean>>;
  currentReport: ReportState;
  updateCurrentReport: (updates: Partial<ReportState>) => void;
  currentType: 'daily' | 'monthly';
  addToast: (message: React.ReactNode, type?: ToastType, duration?: number) => void;
  isReportLocked?: boolean;
}

export function useSurgeryTableData({
  config,
  dateFormat,
  rowsPerPage,
  visibleCols,
  searchableCols,
  currentReport,
  updateCurrentReport,
  currentType,
  addToast,
  isReportLocked = false,
}: UseSurgeryTableDataOptions) {
  const [editingRecord, setEditingRecord] = useState<SurgeryRecord | null>(null);
  const [lastActiveRecordId, setLastActiveRecordId] = useState<string | null>(null);

  // Dynamic Violate Min Time Count
  const dynamicViolateMinTimeCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter((r) => {
      const minTime = getTimeRuleForRecord(r.loaiPTTT, r.ngayBD || r.start, config.timeItemsList, config.timeRules)?.min;
      return minTime && r.timeMinutes < minTime;
    }).length;
  }, [currentReport.result?.validRecords, config.timeRules, config.timeItemsList]);

  // Split PT/TT counts for Tab UI
  const { ptCount, ttCount } = useMemo(() => {
    if (!currentReport.result?.validRecords) return { ptCount: 0, ttCount: 0 };
    return {
      ptCount: currentReport.result.validRecords.filter((r) => r.loaiPTTT?.startsWith('P')).length,
      ttCount: currentReport.result.validRecords.filter((r) => r.loaiPTTT?.startsWith('T')).length,
    };
  }, [currentReport.result?.validRecords]);

  // Calculate Missing Assistant Count
  const missingAssistantCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter((r) => !r.gv || r.gv.trim() === '').length;
  }, [currentReport.result?.validRecords]);

  // Combined stats from result and dynamic calculation
  const derivedStats = useMemo(() => {
    if (!currentReport.result?.stats)
      return {
        totalSurgeries: 0,
        totalDurationMinutes: 0,
        staffConflicts: 0,
        machineConflicts: 0,
        missingMachines: 0,
        lowPaymentCount: 0,
        violateMinTimeCount: 0,
        missingAssistantCount: 0,
      };

    return {
      ...currentReport.result.stats,
      violateMinTimeCount: dynamicViolateMinTimeCount,
      missingAssistantCount,
    };
  }, [currentReport.result?.stats, dynamicViolateMinTimeCount, missingAssistantCount]);

  // -- Memoized Payment Data for Reuse in Print --
  const paymentDataPrepared = useMemo(() => {
    if (!currentReport.result?.paymentData?.rows || !config) return null;

    const rawRows = currentReport.result.paymentData.rows;
    const cols = currentReport.result.paymentData.columns;

    const GROUP_MAP: Record<string, string> = {
      PĐB: 'Phẫu thuật ĐB',
      P1: 'Phẫu thuật loại 1',
      P2: 'Phẫu thuật loại 2',
      P3: 'Phẫu thuật loại 3',
      TĐB: 'Thủ thuật ĐB',
      T1: 'Thủ thuật loại 1',
      T2: 'Thủ thuật loại 2',
      T3: 'Thủ thuật loại 3',
      TKPL: 'Thủ thuật KPL',
    };

    // Calculate Groups
    const groups: { name: string; label: string; subCols: string[] }[] = [];
    let currentGroup = '';
    cols.forEach((col) => {
      const [loai, role] = col.split('-');
      if (loai !== currentGroup) {
        groups.push({ name: loai, label: GROUP_MAP[loai] || loai, subCols: [role] });
        currentGroup = loai;
      } else {
        groups[groups.length - 1].subCols.push(role);
      }
    });

    const enrichedRows = rawRows.map((row, idx) => {
      let rowTotalQty = 0;
      let rowTotalAmount = 0;
      Object.keys(row.values).forEach((colKey) => {
        const qty = row.values[colKey] || 0;
        if (qty > 0) {
          rowTotalQty += qty;
          const [loai, role] = colKey.split('-');
          let configRole: any = 'Giúp việc';
          if (role === 'Chính') configRole = 'Chính';
          else if (role === 'Phụ') configRole = 'Phụ';
          else if (role === 'Giúp việc') configRole = 'Giúp việc';
          const price = config.priceConfig[loai] ? config.priceConfig[loai][configRole] || 0 : 0;
          rowTotalAmount += qty * price;
        }
      });
      return { ...row, stt: idx + 1, total_qty: rowTotalQty, total_amount: rowTotalAmount.toLocaleString('en-US') };
    });

    // Calculate Totals
    const footerTotals: Record<string, number> = { total_qty: 0, total_amount_val: 0 };
    const columnTotals: Record<string, number> = {};
    enrichedRows.forEach((row) => {
      footerTotals.total_qty += row.total_qty;
      footerTotals.total_amount_val += Number(row.total_amount.replace(/,/g, ''));
      Object.keys(row.values).forEach((colKey) => {
        columnTotals[colKey] = (columnTotals[colKey] || 0) + (row.values[colKey] || 0);
      });
    });

    return { enrichedRows, groups, cols, footerTotals, columnTotals };
  }, [currentReport.result?.paymentData, config]);

  const columnsList = useMemo<ColumnDef<SurgeryRecord>[]>(
    () => buildColumnsList(dateFormat, config),
    [config.timeRules, dateFormat]
  );
  const columnsMissing = useMemo<ColumnDef<SurgeryRecord>[]>(
    () => buildColumnsMissing(columnsList),
    [columnsList]
  );
  const columnsStaff = useMemo<ColumnDef<StaffConflict>[]>(
    () => buildColumnsStaff(dateFormat),
    [dateFormat]
  );
  const columnsMachine = useMemo<ColumnDef<MachineConflict>[]>(
    () => buildColumnsMachine(dateFormat),
    [dateFormat]
  );

  const getPaymentColumns = useCallback((): ColumnDef<any>[] => {
    return buildPaymentColumns(currentReport.result?.paymentData?.columns);
  }, [currentReport.result?.paymentData?.columns]);

  // Search terms and active table updaters
  const updateSearchTerm = useCallback(
    (key: string, val: string) => {
      updateCurrentReport({ searchTerms: { ...currentReport.searchTerms, [key]: val } });
      if (key === 'list') setListPage(1);
    },
    [currentReport.searchTerms, updateCurrentReport]
  );

  const setActiveTable = useCallback(
    (table: ReportState['activeTable']) => updateCurrentReport({ activeTable: table }),
    [updateCurrentReport]
  );

  // --- Data Filtering Memos ---
  const listSearchableCols = useMemo(
    () =>
      searchableCols['list'] || {
        patientId: true,
        patientName: true,
        ngayBD: true,
        tenKT: true,
        loaiPTTT: true,
        ptChinh: true,
        ptPhu: true,
        bsGM: true,
        ktvGM: true,
        tdc: true,
        gv: true,
        reason: true,
      },
    [searchableCols]
  );

  const [emptyFilterCol, setEmptyFilterCol] = useState<string | null>(null);
  const [showEmptyFilterMenu, setShowEmptyFilterMenu] = useState(false);

  const filteredList = useMemo(() => {
    let list = (currentReport.result?.validRecords || []).filter((r) =>
      matchSearchQuery(
        r,
        currentReport.searchTerms.list,
        listSearchableCols,
        columnsList,
        config.timeRules,
        config.timeItemsList
      )
    );
    if (emptyFilterCol) {
      list = list.filter((r) => {
        const val = (r as any)[emptyFilterCol];
        if (val === undefined || val === null) return true;
        if (typeof val === 'string') {
          const cleaned = val.trim().replace(/[\u00A0\u200B]/g, '');
          return cleaned === '' || cleaned === '-';
        }
        if (typeof val === 'number') return val === 0;
        return !val;
      });
    }
    return list;
  }, [
    currentReport.result?.validRecords,
    currentReport.searchTerms.list,
    config.timeRules,
    config.timeItemsList,
    listSearchableCols,
    columnsList,
    emptyFilterCol,
  ]);

  const filteredStaff = useMemo(() => {
    return (currentReport.result?.staffConflicts || []).filter((r) =>
      matchSearchQuery(r, currentReport.searchTerms.staff, undefined, columnsStaff)
    );
  }, [currentReport.result?.staffConflicts, currentReport.searchTerms.staff, columnsStaff]);

  const filteredMachine = useMemo(() => {
    return (currentReport.result?.machineConflicts || []).filter((r) =>
      matchSearchQuery(r, currentReport.searchTerms.machine, undefined, columnsMachine)
    );
  }, [currentReport.result?.machineConflicts, currentReport.searchTerms.machine, columnsMachine]);

  const filteredMissing = useMemo(() => {
    const rawData = currentReport.result?.missingRecords || [];
    return rawData.filter((r) =>
      matchSearchQuery(r, currentReport.searchTerms.missing, undefined, columnsMissing)
    );
  }, [currentReport.result?.missingRecords, currentReport.searchTerms.missing, columnsMissing]);

  const [listPage, setListPage] = useState(1);

  useEffect(() => {
    setListPage(1);
  }, [currentReport.searchTerms.list, emptyFilterCol]);

  // Row selection
  const handleRowSelect = useCallback(
    (id: string, selected: boolean) => {
      const currentIds = currentReport.selectedRecordIds || [];
      let newIds;
      if (selected) {
        newIds = [...currentIds, id];
        setLastActiveRecordId(id);
      } else {
        newIds = currentIds.filter((selectedId) => selectedId !== id);
        if (lastActiveRecordId === id) {
          setLastActiveRecordId(newIds.length > 0 ? newIds[newIds.length - 1] : null);
        }
      }
      updateCurrentReport({ selectedRecordIds: newIds });
    },
    [currentReport.selectedRecordIds, lastActiveRecordId, updateCurrentReport]
  );

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      const records = currentReport.result?.validRecords || [];
      if (selected) {
        const allIds = records.map((r) => r.key || r.id).filter((k) => k) as string[];
        updateCurrentReport({ selectedRecordIds: allIds });
      } else {
        updateCurrentReport({ selectedRecordIds: [] });
      }
    },
    [currentReport.result?.validRecords, updateCurrentReport]
  );

  // Modal edit handlers
  const handleOpenEditModal = useCallback(() => {
    const recs = currentReport.result?.validRecords || [];
    const targetId =
      lastActiveRecordId && currentReport.selectedRecordIds.includes(lastActiveRecordId)
        ? lastActiveRecordId
        : currentReport.selectedRecordIds[0];
    const rec = recs.find((r) => (r.key || r.id) === targetId);
    if (rec) {
      setEditingRecord(rec);
    }
  }, [currentReport.result?.validRecords, currentReport.selectedRecordIds, lastActiveRecordId]);

  const handleRowDoubleClick = useCallback((row: any) => {
    if (!row) return;
    if (row.rec1) {
      setEditingRecord(row.rec1);
    } else {
      setEditingRecord(row);
    }
  }, []);

  const handleSaveEditedRecord = useCallback(
    async (updatedRecord: SurgeryRecord) => {
      if (isReportLocked) {
        addToast('Báo cáo đã khóa sổ (Chỉ xem). Không thể chỉnh sửa thông tin ca mổ!', 'error');
        setEditingRecord(null);
        return;
      }

      if (!currentReport.result?.validRecords) return;
      const targetId = updatedRecord.id || updatedRecord.key;
      const index = currentReport.result.validRecords.findIndex((r) => (r.id || r.key) === targetId);
      if (index === -1) return;

      const newRecords = [...currentReport.result.validRecords];
      newRecords[index] = updatedRecord;

      // Lưu Firestore tức thì nếu bản ghi đã có path
      const path = (updatedRecord as any).firestorePath;
      if (path) {
        try {
          const type = currentType === 'monthly' ? 'MONTHLY' : 'DAILY';
          await reportService.updateSingleRecord(path, updatedRecord, type);
        } catch (err) {
          console.error('[SurgeryEdit] Update firestore failed:', err);
        }
      }

      // Tự động tính toán lại toàn diện: cảnh báo trùng NV, trùng máy, thiếu máy, thiếu GV, thanh toán PTTT
      const newResultPartial = recalculateResultFromRecords(newRecords, config);
      updateCurrentReport({
        result: {
          ...currentReport.result,
          validRecords: newRecords,
          ...newResultPartial,
        },
        hasAutoFilledData: true,
      });

      addToast(`Đã lưu thay đổi thông tin của bệnh nhân ${updatedRecord.patientName}.`, 'success');
      setEditingRecord(null);
    },
    [currentReport.result, currentType, config, updateCurrentReport, addToast, isReportLocked]
  );

  // Assistant auto fill & save
  const handleSaveAssistant = useCallback(
    async (val: string) => {
      if (isReportLocked) {
        addToast('Báo cáo đã khóa sổ (Chỉ xem). Không thể thay đổi người giúp việc!', 'error');
        return;
      }

      const cleanVal = val ? val.trim() : '';

      if (cleanVal !== '') {
        const validRoles = ['Phụ', 'GV', 'TDC', 'KTV GM', 'KTV', 'Tit DC', 'Tít DC'];
        const exactMatch = (config.staffList || []).find((s) => s.name === cleanVal);

        const isValidStaff =
          exactMatch &&
          (validRoles.includes(exactMatch.position) ||
            exactMatch.position === 'Phụ' ||
            exactMatch.name.includes('(Phụ)'));

        if (!isValidStaff) {
          let msg = `Tên "${cleanVal}" không có trong danh sách nhân viên.`;
          if (exactMatch) {
            msg = `Nhân viên "${cleanVal}" (chức vụ: ${exactMatch.position}) không được phép làm Giúp việc.`;
          }
          addToast(msg, 'error');
          return; // BLOCK SAVE
        }
      }

      if (!currentReport.result?.validRecords) return;
      const { selectedRecordIds } = currentReport;
      if (!selectedRecordIds || selectedRecordIds.length === 0) return;

      const workingList = currentReport.activeTable === 'list' ? filteredList : currentReport.result.validRecords;
      const updatedIds: string[] = [];
      const isStorage = currentReport.dataSource === 'STORAGE';
      const batchUpdates: Promise<any>[] = [];

      currentReport.result.validRecords.forEach((r) => {
        const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));

        if (isSelected) {
          const rId = r.id || r.key || '';
          r.gv = cleanVal;
          updatedIds.push(rId);

          const path = (r as any).firestorePath;
          if (path) {
            const docRef = doc(firestore, path);
            batchUpdates.push(updateDoc(docRef, { gv: cleanVal }).catch((err) => console.error(err)));
          } else if (isStorage && r.id) {
            const legacyPath = `uploaded_surgeries/${r.id}`;
            const docRef = doc(firestore, legacyPath);
            batchUpdates.push(updateDoc(docRef, { gv: cleanVal }).catch((err) => console.error(err)));
          }
        }
      });

      const stateUpdates: Partial<ReportState> = {};

      if (updatedIds.length > 0) {
        if (batchUpdates.length > 0) {
          try {
            await Promise.all(batchUpdates);
            addToast(`Đã lưu ${updatedIds.length} bản ghi vào hệ thống.`, 'success');
          } catch (e) {
            console.error('Save failed', e);
            addToast('Lỗi khi lưu dữ liệu vào hệ thống.', 'error');
          }
        } else if (currentReport.dataSource === 'EXCEL') {
          addToast(`Đã cập nhật ${updatedIds.length} bản ghi (Chưa lưu vào CSDL)`, 'success');
        }

        const newResultPartial = recalculateResultFromRecords(currentReport.result.validRecords, config);
        stateUpdates.result = { ...currentReport.result, ...newResultPartial };
      }

      // Smart Navigation (Find next empty GV in VISIBLE list)
      let lastSelectedIndex = -1;
      for (let i = workingList.length - 1; i >= 0; i--) {
        const r = workingList[i];
        const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));
        if (isSelected) {
          lastSelectedIndex = i;
          break;
        }
      }

      if (lastSelectedIndex !== -1) {
        let nextIndex = -1;
        for (let i = lastSelectedIndex + 1; i < workingList.length; i++) {
          const r = workingList[i];
          if (!r.gv || r.gv.trim() === '') {
            nextIndex = i;
            break;
          }
        }

        if (nextIndex === -1) {
          for (let i = 0; i <= lastSelectedIndex; i++) {
            const r = workingList[i];
            if (!r.gv || r.gv.trim() === '') {
              nextIndex = i;
              break;
            }
          }
        }

        if (nextIndex !== -1) {
          const nextRecord = workingList[nextIndex];
          const newId = nextRecord.key || nextRecord.id || '';
          stateUpdates.selectedRecordIds = [newId];

          const targetPage = Math.ceil((nextIndex + 1) / rowsPerPage);
          if (targetPage !== listPage) {
            setListPage(targetPage);
          }
        } else {
          stateUpdates.selectedRecordIds = [];
        }
      }

      if (Object.keys(stateUpdates).length > 0) {
        updateCurrentReport(stateUpdates);
      }
    },
    [
      config,
      currentReport,
      filteredList,
      listPage,
      rowsPerPage,
      updateCurrentReport,
      addToast,
    ]
  );

  return {
    editingRecord,
    setEditingRecord,
    dynamicViolateMinTimeCount,
    ptCount,
    ttCount,
    missingAssistantCount,
    derivedStats,
    paymentDataPrepared,
    columnsList,
    columnsMissing,
    columnsStaff,
    columnsMachine,
    getPaymentColumns,
    listSearchableCols,
    emptyFilterCol,
    setEmptyFilterCol,
    showEmptyFilterMenu,
    setShowEmptyFilterMenu,
    filteredList,
    filteredStaff,
    filteredMachine,
    filteredMissing,
    listPage,
    setListPage,
    handleRowSelect,
    handleSelectAll,
    handleOpenEditModal,
    handleRowDoubleClick,
    handleSaveEditedRecord,
    handleSaveAssistant,
    updateSearchTerm,
    setActiveTable,
  };
}
