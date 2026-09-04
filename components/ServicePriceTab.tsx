import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Zap,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Calendar,
  DollarSign,
  Layers,
  ChevronLeft,
  ChevronRight,
  Database,
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import { FileUpload } from './FileUpload';
import {
  SurgeryRecord,
  PatientServicePriceGroup,
  ServicePriceParseResult,
  SurgeryNamePrice,
  RefillCandidateItem
} from '../types';
import {
  parseServicePriceExcel,
  matchAndApplyServicePrices,
  PriceMatchResult,
} from '../services/servicePriceProcessor';
import { reportService } from '../services/reportService';
import {
  generateRefillCandidates,
  applyRefillCandidatesToCatalog
} from '../services/surgeryNamePriceService';
import { RefillModal } from './statistics/RefillModal';

interface ServicePriceTabProps {
  onPricesApplied: (appliedRecords: SurgeryRecord[], matchResult: PriceMatchResult) => void;
  currentLoadedRecords?: SurgeryRecord[];
  addToast: (message: React.ReactNode, type?: 'info' | 'success' | 'warning' | 'error') => void;
  cachedServiceGroups?: PatientServicePriceGroup[];
  onCacheServiceGroups: (groups: PatientServicePriceGroup[]) => void;
  surgeryNamePrices?: SurgeryNamePrice[];
}

export const ServicePriceTab: React.FC<ServicePriceTabProps> = ({
  onPricesApplied,
  currentLoadedRecords = [],
  addToast,
  cachedServiceGroups = [],
  onCacheServiceGroups,
  surgeryNamePrices = [],
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parseResult, setParseResult] = useState<ServicePriceParseResult | null>(null);
  const [matchResult, setMatchResult] = useState<PriceMatchResult | null>(null);

  // Table filter and pagination states
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Handle file selection
  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setParseResult(null);
    setMatchResult(null);
    setCurrentPage(1);
  };

  // Reset file & state
  const handleReset = () => {
    setSelectedFile(null);
    setParseResult(null);
    setMatchResult(null);
    setCurrentPage(1);
  };

  // Process file and match with online/current records
  const handleProcess = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      // 1. Bóc tách file Excel
      const parsed = await parseServicePriceExcel(selectedFile);
      if (!parsed.valid) {
        addToast(parsed.error || 'File không hợp lệ', 'error');
        setIsProcessing(false);
        return;
      }

      setParseResult(parsed);
      onCacheServiceGroups(parsed.patientGroups);

      // 2. Lấy dữ liệu phẫu thuật trong kỳ từ Firestore
      let targetRecords: SurgeryRecord[] = [];

      if (parsed.dateFrom && parsed.dateTo) {
        const dateFromStr = `${parsed.dateFrom}T${parsed.timeFrom}:00.000+07:00`;
        const dateToStr = `${parsed.dateTo}T${parsed.timeToStr}:59.999+07:00`;
        const isoFrom = new Date(dateFromStr).toISOString();
        const isoTo = new Date(dateToStr).toISOString();

        addToast(`Đang truy vấn dữ liệu phẫu thuật từ Firestore (${parsed.dateFrom} đến ${parsed.dateTo})...`, 'info');

        try {
          const persisted = await reportService.getReports(isoFrom, isoTo, 'MONTHLY');
          if (persisted && persisted.length > 0) {
            targetRecords = persisted.map((r) => ({
              ...r,
              stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string, 10) || 0,
              start: r.ngayBD ? new Date(r.ngayBD) : null,
              end: r.ngayKT ? new Date(r.ngayKT) : null,
              maTuongDuong: (r as any).maTuongDuong,
              donGia: (r as any).donGia,
              thanhTien: (r as any).thanhTien,
            }));
          }
        } catch (fetchErr: any) {
          console.warn('Could not fetch from Firestore, falling back to current session records:', fetchErr);
        }
      }

      // Fallback nếu Firestore không có dữ liệu: dùng currentLoadedRecords trong phiên
      if (targetRecords.length === 0 && currentLoadedRecords.length > 0) {
        targetRecords = [...currentLoadedRecords];
      }

      if (targetRecords.length === 0) {
        addToast(
          'Không tìm thấy ca phẫu thuật nào trong khoảng thời gian này trên Firestore và phiên làm việc.',
          'warning'
        );
        setIsProcessing(false);
        return;
      }

      // 3. Thực hiện đối chiếu khớp giá
      const matched = matchAndApplyServicePrices(targetRecords, parsed.patientGroups);
      setMatchResult(matched);

      // Cập nhật lên app state
      onPricesApplied(matched.updatedRecords, matched);

      addToast(
        `Khớp thành công ${matched.matchedCount} / ${targetRecords.length} ca phẫu thuật. Hãy bấm "Lưu vào Lưu trữ" để đồng bộ Firestore.`,
        'success'
      );
    } catch (error: any) {
      console.error('Error processing service price file:', error);
      addToast(`Lỗi xử lý: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Save matched prices to Firestore batch
  const handleSaveToFirestore = async () => {
    if (!matchResult) return;

    const matchedWithFirestore = matchResult.matchDetails.filter(
      (d) => d.matched && d.record.firestorePath
    );

    if (matchedWithFirestore.length === 0) {
      addToast(
        'Không có bản ghi nào có liên kết Firestore để cập nhật trực tiếp (dữ liệu có thể chưa được lưu vào Firestore). Hãy lưu báo cáo trước.',
        'warning'
      );
      return;
    }

    setIsSaving(true);
    try {
      const updates = matchedWithFirestore.map((d) => ({
        firestorePath: d.record.firestorePath!,
        maTuongDuong: d.record.maTuongDuong,
        donGia: d.record.donGia,
        thanhTien: d.record.thanhTien,
        priceSource: 'excel_dvkt' as const,
      }));

      const updatedCount = await reportService.batchUpdatePrices(updates);
      addToast(`Đã lưu thành công thông tin mã tương đương & giá cho ${updatedCount} ca vào CSDL Lưu trữ.`, 'success');
    } catch (error: any) {
      console.error('Error saving prices to Firestore:', error);
      addToast(`Lỗi khi lưu vào Firestore: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Refill Modal state
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillCandidates, setRefillCandidates] = useState<RefillCandidateItem[]>([]);
  const [isRefilling, setIsRefilling] = useState(false);

  // Open Refill Modal with matched records from Excel
  const handleOpenRefillModal = () => {
    if (!matchResult || matchResult.matchedCount === 0) {
      addToast('Chưa có ca phẫu thuật nào được khớp giá để refill.', 'warning');
      return;
    }

    const matchedRecords = matchResult.matchDetails
      .filter((d) => d.matched && d.record.maTuongDuong && d.record.donGia)
      .map((d) => d.record);

    if (matchedRecords.length === 0) {
      addToast('Không có ca nào có đủ mã tương đương và đơn giá để refill.', 'warning');
      return;
    }

    const candidates = generateRefillCandidates(matchedRecords, surgeryNamePrices);
    if (candidates.length === 0) {
      addToast('Không tìm thấy DVKT nào đủ điều kiện để refill vào Danh mục giá.', 'warning');
      return;
    }

    setRefillCandidates(candidates);
    setShowRefillModal(true);
  };

  // Confirm apply refill to catalog
  const handleConfirmRefill = async (selected: RefillCandidateItem[]) => {
    setIsRefilling(true);
    try {
      const res = await applyRefillCandidatesToCatalog(selected);
      addToast(
        `Đã refill thành công: ${res.updated} mục cập nhật giá, ${res.created} mục thêm mới vào Danh mục giá.`,
        'success'
      );
      setShowRefillModal(false);
    } catch (error: any) {
      console.error('Error applying refill to catalog:', error);
      addToast(`Lỗi khi refill vào Danh mục giá: ${error.message}`, 'error');
    } finally {
      setIsRefilling(false);
    }
  };

  // Filtered rows for preview
  const filteredDetails = useMemo(() => {
    if (!matchResult) return [];

    return matchResult.matchDetails.filter((d) => {
      // Filter by status tab
      if (activeFilter === 'matched' && !d.matched) return false;
      if (activeFilter === 'unmatched' && d.matched) return false;

      // Filter by search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const r = d.record;
        const matchName = (r.patientName || '').toLowerCase().includes(q);
        const matchId = (r.patientId || '').toLowerCase().includes(q);
        const matchTech = (r.tenKT || '').toLowerCase().includes(q);
        const matchCode = (r.maTuongDuong || '').toLowerCase().includes(q);
        return matchName || matchId || matchTech || matchCode;
      }

      return true;
    });
  }, [matchResult, activeFilter, searchTerm]);

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredDetails.length / pageSize) || 1;
  const paginatedDetails = useMemo(() => {
    if (pageSize === -1) return filteredDetails;
    const start = (currentPage - 1) * pageSize;
    return filteredDetails.slice(start, start + pageSize);
  }, [filteredDetails, currentPage, pageSize]);

  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in max-w-[1600px] mx-auto w-full">
      {/* ── Hướng dẫn lấy báo cáo từ phần mềm HIS ── */}
      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/80 text-xs text-blue-900 shadow-sm">
        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
          <Info className="h-4 w-4" />
        </div>
        <div className="flex-1 leading-relaxed">
          <div className="font-bold text-blue-950 text-xs mb-1 flex items-center gap-2">
            <span>📋 Hướng dẫn xuất file Excel từ phần mềm HIS:</span>
          </div>
          <p className="text-blue-900/90">
            Chọn <strong className="text-blue-950 bg-blue-100/80 px-1.5 py-0.5 rounded font-bold">Báo cáo</strong> / <strong className="text-blue-950 bg-blue-100/80 px-1.5 py-0.5 rounded font-bold">BC cận lâm sàng</strong> → chọn <strong className="text-blue-950 bg-blue-100/80 px-1.5 py-0.5 rounded font-bold">Thống kê dịch vụ kỹ thuật</strong>.
            {' '}Thiết lập các tùy chọn:{' '}
            <span className="font-semibold text-blue-950 underline decoration-blue-300">Ngày lập phiếu</span>,{' '}
            <span>Loại dịch vụ (</span><strong className="text-blue-950 font-bold">Phẫu thuật, thủ thuật</strong><span>)</span>;{' '}
            <span>nhóm theo: </span><strong className="text-blue-950 font-bold">Họ tên</strong>;{' '}
            <span>tích chọn: </span>
            <span className="inline-flex items-center font-bold text-blue-950 bg-blue-200/80 px-1.5 py-0.5 rounded border border-blue-300/60">
              ✓ Không xuống dòng khi in
            </span>.
          </p>
        </div>
      </div>

      {/* ── Top Upload & Control Frame ── */}
      <div className={`p-4 rounded-2xl border transition-all duration-200 shadow-sm ${
        selectedFile ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-gray-200'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* File Upload Dropzone */}
          <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              selectedFile ? 'bg-amber-500 text-white' : 'bg-primary-700 text-white'
            }`}>
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-bold text-gray-800 text-sm">
                File Thống kê dịch vụ kỹ thuật (Excel)
              </span>
              <div className="h-10 mt-1">
                <FileUpload
                  label=""
                  file={selectedFile}
                  onFileSelect={handleFileSelect}
                  accept=".xlsx, .xls"
                  compact={true}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            {isProcessing ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 font-bold text-xs animate-pulse">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Đang xử lý & đối chiếu...
              </div>
            ) : (
              <>
                <button
                  onClick={handleProcess}
                  disabled={!selectedFile}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${
                    selectedFile
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Zap className="h-4 w-4" />
                  Đối chiếu & Áp giá
                </button>
                {selectedFile && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:scale-95 transition-all"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Hủy
                  </button>
                )}
              </>
            )}

            {/* Nút lưu vào Firestore */}
            {matchResult && matchResult.matchedCount > 0 && (
              <button
                onClick={handleSaveToFirestore}
                disabled={isSaving}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${
                  isSaving
                    ? 'bg-amber-100 text-amber-700 cursor-wait'
                    : 'bg-primary-700 text-white hover:bg-primary-800 active:scale-95'
                }`}
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Đang lưu vào CSDL...' : 'Lưu vào Lưu trữ (Firestore)'}
              </button>
            )}

            {/* Nút Refill vào Danh mục giá */}
            {matchResult && matchResult.matchedCount > 0 && (
              <button
                onClick={handleOpenRefillModal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-sm"
              >
                <Sparkles className="h-4 w-4 text-emerald-200" />
                Refill vào Danh mục giá
              </button>
            )}
          </div>
        </div>

        {/* Thông tin kỳ trích xuất từ E3 */}
        {parseResult?.dateRangeText && (
          <div className="mt-3 pt-3 border-t border-amber-200/60 flex items-center gap-2 text-xs text-amber-800 font-medium">
            <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Kỳ dữ liệu trích xuất từ file:</span>
            <span className="font-bold bg-amber-200/70 px-2 py-0.5 rounded-md">
              {parseResult.dateRangeText}
            </span>
            <span className="text-gray-400">|</span>
            <span>Số BN trong file: <strong>{parseResult.patientGroups.length.toLocaleString('vi-VN')}</strong></span>
            <span className="text-gray-400">|</span>
            <span>Tổng DVKT: <strong>{parseResult.serviceCount.toLocaleString('vi-VN')}</strong></span>
          </div>
        )}
      </div>

      {/* ── Summary KPI Cards ── */}
      {matchResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tổng ca trong kỳ</p>
              <p className="text-xl font-extrabold text-gray-800 mt-0.5">
                {matchResult.matchDetails.length.toLocaleString('vi-VN')}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Database className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Đã khớp giá</p>
              <p className="text-xl font-extrabold text-emerald-700 mt-0.5">
                {matchResult.matchedCount.toLocaleString('vi-VN')}{' '}
                <span className="text-xs font-normal text-emerald-600">
                  ({Math.round((matchResult.matchedCount / (matchResult.matchDetails.length || 1)) * 100)}%)
                </span>
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Chưa khớp giá</p>
              <p className="text-xl font-extrabold text-amber-700 mt-0.5">
                {matchResult.unmatchedCount.toLocaleString('vi-VN')}
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-primary-600 uppercase tracking-wider">Tổng thành tiền khớp</p>
              <p className="text-xl font-extrabold text-primary-700 mt-0.5">
                {matchResult.totalMatchedAmount.toLocaleString('vi-VN')} <span className="text-xs">đ</span>
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* ── Table & Filter Area ── */}
      {matchResult && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          {/* Table Toolbar */}
          <div className="p-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-200/60 rounded-xl text-xs font-semibold">
              <button
                onClick={() => { setActiveFilter('all'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFilter === 'all'
                    ? 'bg-white text-gray-800 shadow-sm font-bold'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Tất cả ({matchResult.matchDetails.length})
              </button>
              <button
                onClick={() => { setActiveFilter('matched'); setCurrentPage(1); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  activeFilter === 'matched'
                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã khớp ({matchResult.matchedCount})
              </button>
              <button
                onClick={() => { setActiveFilter('unmatched'); setCurrentPage(1); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  activeFilter === 'unmatched'
                    ? 'bg-amber-500 text-white shadow-sm font-bold'
                    : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Chưa khớp ({matchResult.unmatchedCount})
              </button>
            </div>

            {/* Search Input & Page Size */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm Mã BN, tên, kỹ thuật..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 font-medium focus:outline-none"
              >
                <option value={10}>10 dòng</option>
                <option value={20}>20 dòng</option>
                <option value={50}>50 dòng</option>
                <option value={100}>100 dòng</option>
                <option value={-1}>Tất cả</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                  <th className="py-2.5 px-3 text-center w-12">STT</th>
                  <th className="py-2.5 px-3 w-28">Mã BN</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Họ tên bệnh nhân</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Tên kỹ thuật</th>
                  <th className="py-2.5 px-3 text-center w-14">SL</th>
                  <th className="py-2.5 px-3 w-32">Mã tương đương</th>
                  <th className="py-2.5 px-3 text-right w-28">Đơn giá</th>
                  <th className="py-2.5 px-3 text-right w-32">Thành tiền</th>
                  <th className="py-2.5 px-3 text-center w-28">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedDetails.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400 font-medium">
                      Không tìm thấy bản ghi nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  paginatedDetails.map((item, idx) => {
                    const r = item.record;
                    const stt = pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr
                        key={r.id || `${r.patientId}-${idx}`}
                        className={`hover:bg-primary-50/40 transition-colors ${
                          item.matched ? '' : 'bg-amber-50/20'
                        }`}
                      >
                        <td className="py-2 px-3 text-center text-gray-500">{stt}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-gray-700">{r.patientId}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{r.patientName}</td>
                        <td className="py-2 px-3 text-gray-700">{r.tenKT}</td>
                        <td className="py-2 px-3 text-center font-bold text-gray-700">{r.soLuong}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-blue-700">
                          {r.maTuongDuong ? (
                            <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {r.maTuongDuong}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-700">
                          {r.donGia ? r.donGia.toLocaleString('vi-VN') : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {r.thanhTien ? r.thanhTien.toLocaleString('vi-VN') : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.matched ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Đã khớp
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              <AlertTriangle className="h-3 w-3" /> Chưa khớp
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          {pageSize !== -1 && totalPages > 1 && (
            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
              <span>
                Hiển thị {(currentPage - 1) * pageSize + 1} -{' '}
                {Math.min(currentPage * pageSize, filteredDetails.length)} trên tổng số {filteredDetails.length} ca
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-semibold text-gray-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refill Review Modal */}
      <RefillModal
        isOpen={showRefillModal}
        onClose={() => setShowRefillModal(false)}
        title="Refill Danh mục giá từ File Excel"
        subtitle="Đối chiếu các ca phẫu thuật đã khớp từ file Excel với Danh mục giá hiện tại theo Mã tương đương và Ngày thực hiện."
        candidates={refillCandidates}
        onConfirm={handleConfirmRefill}
        isConfirming={isRefilling}
        confirmLabel="Áp dụng vào Danh mục giá"
      />
    </div>
  );
};
