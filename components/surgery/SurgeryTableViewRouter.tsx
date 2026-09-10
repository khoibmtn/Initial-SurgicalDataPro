import React from 'react';
import { DynamicTable, ColumnDef } from '../common/DynamicTable';
import { PaymentTableView } from './PaymentTableView';
import { DutyScheduleTab } from '../duty/DutyScheduleTab';
import { OvertimeTab } from '../overtime/OvertimeTab';
import {
  SurgeryRecord,
  StaffConflict,
  MachineConflict,
  ProcessingResult,
  ProcessedStats,
  SurgeryConfig,
  DutySchedule,
} from '../../types';
import { getTimeRuleForRecord } from '../../services/laborConfigService';

export interface SurgeryTableViewRouterProps {
  currentReport: {
    result: ProcessingResult | null;
    stats: ProcessedStats | null;
    activeTable: 'list' | 'staff' | 'machine' | 'missing' | 'payment' | 'duty' | 'overtime' | null;
    selectedRecordIds: string[];
    searchTerms: {
      list: string;
      staff: string;
      machine: string;
      missing: string;
      payment: string;
      duty?: string;
      overtime?: string;
    };
    dataSource: 'EXCEL' | 'STORAGE' | null;
    queryDateRangeText?: string;
    listDateRange?: string;
  };
  config: SurgeryConfig;
  dateFormat: string;
  onDateFormatChange: (format: string) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (rows: number) => void;
  visibleCols: Record<string, string[]>;
  onVisibleColsChange: (table: string, cols: string[]) => void;
  onSearchChange: (table: string, val: string) => void;
  listSearchableCols: string[];
  onSearchableColsChange: (table: string, cols: string[]) => void;
  columnsList: ColumnDef<SurgeryRecord>[];
  columnsStaff: ColumnDef<StaffConflict>[];
  columnsMachine: ColumnDef<MachineConflict>[];
  columnsMissing: ColumnDef<SurgeryRecord>[];
  filteredList: SurgeryRecord[];
  filteredStaff: StaffConflict[];
  filteredMachine: MachineConflict[];
  filteredMissing: SurgeryRecord[];
  paymentDataPrepared: any[];
  listPage: number;
  onListPageChange: (page: number) => void;
  emptyFilterCol: string | null;
  onEmptyFilterColChange: (updater: string | null | ((prev: string | null) => string | null)) => void;
  showEmptyFilterMenu: boolean;
  onShowEmptyFilterMenuChange: (updater: boolean | ((prev: boolean) => boolean)) => void;
  onRowSelect: (id: string, shiftKey: boolean, ctrlKey: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onDeleteSelected: () => void;
  onOpenEditModal: () => void;
  onRowDoubleClick: (row: any) => void;
  onSaveAssistant: (val: string) => Promise<void>;
  dutySchedules: Record<string, DutySchedule>;
  onUpdateDutySchedule: (date: string, schedule: DutySchedule) => Promise<void>;
  isSavingDutySchedule: boolean;
  onNavigateToDutyTab: () => void;
  onRegisterPrintHandler: (handler: () => void) => void;
  onTriggerPrint: (pConfig: any) => void;
}

export const SurgeryTableViewRouter: React.FC<SurgeryTableViewRouterProps> = ({
  currentReport,
  config,
  dateFormat,
  onDateFormatChange,
  rowsPerPage,
  onRowsPerPageChange,
  visibleCols,
  onVisibleColsChange,
  onSearchChange,
  listSearchableCols,
  onSearchableColsChange,
  columnsList,
  columnsStaff,
  columnsMachine,
  columnsMissing,
  filteredList,
  filteredStaff,
  filteredMachine,
  filteredMissing,
  paymentDataPrepared,
  listPage,
  onListPageChange,
  emptyFilterCol,
  onEmptyFilterColChange,
  showEmptyFilterMenu,
  onShowEmptyFilterMenuChange,
  onRowSelect,
  onSelectAll,
  onDeleteSelected,
  onOpenEditModal,
  onRowDoubleClick,
  onSaveAssistant,
  dutySchedules,
  onUpdateDutySchedule,
  isSavingDutySchedule,
  onNavigateToDutyTab,
  onRegisterPrintHandler,
  onTriggerPrint,
}) => {
  if (!currentReport.result || !currentReport.stats || !currentReport.activeTable) return null;

  if (currentReport.activeTable === 'list') {
    const rowStyle = (r: SurgeryRecord) => {
      const min = getTimeRuleForRecord(r.loaiPTTT, r.ngayBD || r.start, config.timeItemsList, config.timeRules)?.min;
      return min && r.timeMinutes < min ? 'bg-yellow-50 text-red-600 font-medium' : '';
    };
    const ptCount = currentReport.result.validRecords.filter((r) => r.loaiPTTT?.startsWith('P')).length;
    const ttCount = currentReport.result.validRecords.filter((r) => r.loaiPTTT?.startsWith('T')).length;
    const countLabel = `${ptCount} ca PT, ${ttCount} ca TT`;

    return (
      <DynamicTable
        data={filteredList}
        columns={columnsList}
        tableName="Danh sách phẫu thuật"
        dateFormat={dateFormat}
        onDateFormatChange={onDateFormatChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        defaultVisibleCols={visibleCols['list']}
        onVisibleColsChange={(cols) => onVisibleColsChange('list', cols)}
        rowStyle={rowStyle}
        rowCountLabel={countLabel}
        searchTerm={currentReport.searchTerms.list}
        onSearchChange={(val) => onSearchChange('list', val)}
        searchableCols={listSearchableCols}
        onSearchableColsChange={(cols) => onSearchableColsChange('list', cols)}
        showSearchSettings
        enableSelection={true}
        selectedIds={currentReport.selectedRecordIds}
        onSelect={onRowSelect}
        onSelectAll={onSelectAll}
        onDelete={onDeleteSelected}
        onEditRecord={onOpenEditModal}
        onRowDoubleClick={onRowDoubleClick}
        currentPage={listPage}
        onPageChange={onListPageChange}
        onSaveAssistant={onSaveAssistant}
        extraSearchContent={
          <div className="relative ml-2 flex items-center">
            <div className="inline-flex rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => onEmptyFilterColChange((prev) => (prev === 'gv' ? null : 'gv'))}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 transition-all select-none whitespace-nowrap ${
                  emptyFilterCol
                    ? 'bg-red-50 text-red-700 hover:bg-red-100 font-semibold'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title={emptyFilterCol ? 'Nhấp để bỏ lọc ô trống' : 'Nhấp để lọc nhanh các ca chưa có Giúp việc'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {emptyFilterCol ? (
                  <>
                    <span>
                      Lọc trống: <strong className="text-red-800">{columnsList.find((c) => c.key === emptyFilterCol)?.label || emptyFilterCol}</strong>
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onEmptyFilterColChange(null);
                      }}
                      className="ml-1 text-red-400 hover:text-red-700 cursor-pointer"
                      title="Bỏ lọc"
                    >
                      ✕
                    </span>
                  </>
                ) : (
                  'Lọc GV trống'
                )}
              </button>
              <button
                type="button"
                onClick={() => onShowEmptyFilterMenuChange((prev) => !prev)}
                className={`px-1.5 py-1.5 border-l border-gray-200 transition-colors ${
                  emptyFilterCol ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="Chọn cột khác để lọc ô trống"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {showEmptyFilterMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => onShowEmptyFilterMenuChange(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[210px] max-h-[320px] overflow-y-auto">
                  <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    Chọn cột cần lọc trống
                  </div>
                  {columnsList
                    .filter((c) => c.key !== 'stt')
                    .map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => {
                          onEmptyFilterColChange((prev) => (prev === col.key ? null : col.key));
                          onShowEmptyFilterMenuChange(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                          emptyFilterCol === col.key ? 'bg-red-50 text-red-800 font-bold' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                            emptyFilterCol === col.key ? 'bg-red-600 border-red-600' : 'border-gray-300'
                          }`}
                        >
                          {emptyFilterCol === col.key && (
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {col.label}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        }
      />
    );
  }

  if (currentReport.activeTable === 'staff') {
    const staffRowStyle = (r: StaffConflict) => (r.violationType === 'max2' ? 'text-red-600 font-bold bg-red-50' : '');
    return (
      <DynamicTable
        data={filteredStaff}
        columns={columnsStaff}
        tableName="Danh sách trùng giờ nhân viên"
        dateFormat={dateFormat}
        onDateFormatChange={onDateFormatChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        defaultVisibleCols={visibleCols['staff']}
        onVisibleColsChange={(cols) => onVisibleColsChange('staff', cols)}
        rowStyle={staffRowStyle}
        searchTerm={currentReport.searchTerms.staff}
        onSearchChange={(val) => onSearchChange('staff', val)}
        onRowDoubleClick={onRowDoubleClick}
      />
    );
  }

  if (currentReport.activeTable === 'machine') {
    return (
      <DynamicTable
        data={filteredMachine}
        columns={columnsMachine}
        tableName="Danh sách trùng máy thực hiện"
        dateFormat={dateFormat}
        onDateFormatChange={onDateFormatChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        defaultVisibleCols={visibleCols['machine']}
        onVisibleColsChange={(cols) => onVisibleColsChange('machine', cols)}
        searchTerm={currentReport.searchTerms.machine}
        onSearchChange={(val) => onSearchChange('machine', val)}
        onRowDoubleClick={onRowDoubleClick}
      />
    );
  }

  if (currentReport.activeTable === 'missing') {
    return (
      <DynamicTable
        data={filteredMissing}
        columns={columnsMissing}
        tableName="Danh sách thiếu mã máy"
        dateFormat={dateFormat}
        onDateFormatChange={onDateFormatChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        defaultVisibleCols={visibleCols['missing']}
        onVisibleColsChange={(cols) => onVisibleColsChange('missing', cols)}
        searchTerm={currentReport.searchTerms.missing}
        onSearchChange={(val) => onSearchChange('missing', val)}
        onRowDoubleClick={onRowDoubleClick}
      />
    );
  }

  if (currentReport.activeTable === 'payment') {
    return (
      <PaymentTableView
        paymentDataPrepared={paymentDataPrepared}
        searchTerm={currentReport.searchTerms.payment}
        onSearchChange={(val) => onSearchChange('payment', val)}
        visibleCols={visibleCols['payment']}
        onVisibleColsChange={(cols) => onVisibleColsChange('payment', cols)}
        dateFormat={dateFormat}
        onDateFormatChange={onDateFormatChange}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        config={config}
      />
    );
  }

  if (currentReport.activeTable === 'duty') {
    return (
      <DutyScheduleTab
        records={currentReport.result.validRecords}
        dutySchedules={dutySchedules}
        onUpdateDutySchedule={onUpdateDutySchedule}
        config={config}
        isSaving={isSavingDutySchedule}
        dateRangeText={
          currentReport.dataSource === 'STORAGE' && currentReport.queryDateRangeText
            ? currentReport.queryDateRangeText
            : currentReport.result?.dateRangeText || currentReport.queryDateRangeText || currentReport.listDateRange || ''
        }
      />
    );
  }

  if (currentReport.activeTable === 'overtime') {
    return (
      <OvertimeTab
        records={currentReport.result.validRecords}
        dutySchedules={dutySchedules}
        config={config}
        dateFormat={dateFormat}
        onNavigateToDutyTab={onNavigateToDutyTab}
        reportDateRangeText={
          currentReport.dataSource === 'STORAGE' && currentReport.queryDateRangeText
            ? currentReport.queryDateRangeText
            : currentReport.result?.dateRangeText || currentReport.listDateRange || ''
        }
        onRegisterPrintHandler={onRegisterPrintHandler}
        onTriggerPrint={onTriggerPrint}
      />
    );
  }

  return null;
};
