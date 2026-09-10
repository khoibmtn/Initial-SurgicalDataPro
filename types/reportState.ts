import { format } from 'date-fns';
import { ProcessingResult, ProcessedStats } from '../types';

export type DataTabType = 'storage' | 'upload' | 'price_service';
export type ActiveTableType = 'list' | 'staff' | 'machine' | 'missing' | 'payment' | 'duty' | 'overtime' | null;

export interface ReportState {
  result: ProcessingResult | null;
  stats: ProcessedStats | null;
  isProcessing: boolean;
  listFile: File | null;
  activeTable: ActiveTableType;
  selectedRecordIds: string[]; // IDs of selected records (for 'list' table)
  searchTerms: {
    list: string;
    staff: string;
    machine: string;
    missing: string;
    payment: string;
    duty?: string;
    overtime?: string;
  };
  // UI State for Date Range Pickers (Independent per tab)
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
  // File Meta (Legacy Strings from Validator)
  listDateRange: string;
  dataSource: 'EXCEL' | 'STORAGE' | null;
  queryDateRangeText?: string;
  hasAutoFilledData?: boolean; // Track if auto-fill succeeded for enabling save button
}

export const createInitialReportState = (): ReportState => ({
  result: null,
  stats: null,
  isProcessing: false,
  listFile: null,
  activeTable: null,
  selectedRecordIds: [],
  searchTerms: {
    list: '',
    staff: '',
    machine: '',
    missing: '',
    payment: '',
    duty: '',
    overtime: '',
  },
  dateFrom: format(new Date(), 'yyyy-MM-dd'),
  timeFrom: '00:00',
  dateTo: format(new Date(), 'yyyy-MM-dd'),
  timeTo: '23:59',
  listDateRange: '',
  dataSource: null,
  hasAutoFilledData: false,
});
