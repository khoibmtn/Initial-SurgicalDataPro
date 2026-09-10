import React from 'react';
import { Download, Zap } from 'lucide-react';

export interface StorageQueryBarProps {
  currentType: 'daily' | 'monthly';
  monthlyTimeMode: 'month' | 'range';
  onMonthlyTimeModeChange: (mode: 'month' | 'range') => void;
  selectedMonthlyYear: number;
  onMonthlyYearChange: (year: number) => void;
  availableMonthlyYears: number[];
  selectedMonthlyMonth: number;
  onMonthlyMonthChange: (month: number) => void;
  availableMonthlyMonthsMap: Record<number, number[]>;
  dateFrom: string;
  onDateFromChange: (val: string) => void;
  dateTo: string;
  onDateToChange: (val: string) => void;
  timeFrom: string;
  onTimeFromChange: (val: string) => void;
  timeTo: string;
  onTimeToChange: (val: string) => void;
  onGetReport: () => void;
  onAutoFill24hShift: () => void;
  handleTimeChange: (val: string, setter: (v: string) => void) => void;
}

export const StorageQueryBar: React.FC<StorageQueryBarProps> = ({
  currentType,
  monthlyTimeMode,
  onMonthlyTimeModeChange,
  selectedMonthlyYear,
  onMonthlyYearChange,
  availableMonthlyYears,
  selectedMonthlyMonth,
  onMonthlyMonthChange,
  availableMonthlyMonthsMap,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  timeFrom,
  onTimeFromChange,
  timeTo,
  onTimeToChange,
  onGetReport,
  onAutoFill24hShift,
  handleTimeChange,
}) => {
  return (
    <div className="px-4 pt-2 pb-1">
      {currentType === 'monthly' ? (
        /* ── GIAO DIỆN BÁO CÁO THÁNG ── */
        <div className="flex items-center gap-3 flex-wrap">
          {/* 1. Box Lấy số liệu theo */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Lấy số liệu theo:</label>
            <select
              value={monthlyTimeMode}
              onChange={(e) => onMonthlyTimeModeChange(e.target.value as 'month' | 'range')}
              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-primary-500 outline-none shadow-xs cursor-pointer"
            >
              <option value="month">Tháng</option>
              <option value="range">Khoảng thời gian</option>
            </select>
          </div>

          {monthlyTimeMode === 'month' ? (
            <>
              {/* 2. Box Năm */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Năm:</label>
                <select
                  value={selectedMonthlyYear}
                  onChange={(e) => onMonthlyYearChange(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-primary-500 outline-none shadow-xs cursor-pointer min-w-[85px]"
                >
                  {availableMonthlyYears.map(y => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>

              {/* 3. Box Tháng */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Tháng:</label>
                <select
                  value={selectedMonthlyMonth}
                  onChange={(e) => onMonthlyMonthChange(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-primary-500 outline-none shadow-xs cursor-pointer min-w-[95px]"
                >
                  {(availableMonthlyMonthsMap[selectedMonthlyYear] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map(m => (
                    <option key={m} value={m}>Tháng {String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              {/* Nút Lấy dữ liệu */}
              <button
                onClick={onGetReport}
                className="px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white transition-colors shadow-sm cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Lấy dữ liệu
              </button>
            </>
          ) : (
            <>
              {/* Chế độ Khoảng thời gian: Từ/Đến, Lấy dữ liệu và Dữ liệu trực */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Từ:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="HH:mm"
                  value={timeFrom}
                  onChange={(e) => handleTimeChange(e.target.value, onTimeFromChange)}
                  maxLength={5}
                  className="w-16 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Đến:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="HH:mm"
                  value={timeTo}
                  onChange={(e) => handleTimeChange(e.target.value, onTimeToChange)}
                  maxLength={5}
                  className="w-16 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
                />
              </div>
              <button
                onClick={onGetReport}
                className="px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white transition-colors shadow-sm cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Lấy dữ liệu
              </button>
              <button
                onClick={onAutoFill24hShift}
                className="px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" />
                Dữ liệu trực
              </button>
            </>
          )}
        </div>
      ) : (
        /* ── GIAO DIỆN BÁO CÁO HÀNG NGÀY ── */
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Từ:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <input
              type="text"
              placeholder="HH:mm"
              value={timeFrom}
              onChange={(e) => handleTimeChange(e.target.value, onTimeFromChange)}
              maxLength={5}
              className="w-16 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Đến:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <input
              type="text"
              placeholder="HH:mm"
              value={timeTo}
              onChange={(e) => handleTimeChange(e.target.value, onTimeToChange)}
              maxLength={5}
              className="w-16 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
            />
          </div>
          <button
            onClick={onGetReport}
            className="px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white transition-colors shadow-sm cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Lấy dữ liệu
          </button>
          <button
            onClick={onAutoFill24hShift}
            className="px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 bg-white text-primary-700 border border-primary-200 hover:bg-primary-50 transition-colors cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            Dữ liệu trực
          </button>
        </div>
      )}
    </div>
  );
};
