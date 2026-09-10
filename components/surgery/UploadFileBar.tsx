import React from 'react';
import { FileText, RefreshCw, Zap, RotateCcw } from 'lucide-react';
import { FileUpload } from '../FileUpload';

export interface UploadFileBarProps {
  listFile: File | null;
  isProcessing: boolean;
  onFileSelect: (file: File | null) => void;
  onProcess: () => void;
  onReset: () => void;
}

export const UploadFileBar: React.FC<UploadFileBarProps> = ({
  listFile,
  isProcessing,
  onFileSelect,
  onProcess,
  onReset,
}) => {
  return (
    <div className="px-4 pt-3 pb-2">
      <div
        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
          listFile ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'
        }`}
      >
        {/* File info + drop zone (left, expanded) */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              listFile ? 'bg-amber-500 text-white' : 'bg-primary-700 text-white'
            }`}
          >
            <FileText className="h-4 w-4" />
          </div>
          <span className="font-bold text-gray-800 text-sm shrink-0">Danh sách PT</span>
          <div className="flex-1 min-w-0 h-10">
            <FileUpload
              label=""
              file={listFile}
              onFileSelect={onFileSelect}
              accept=".xlsx, .xls"
              compact={true}
            />
          </div>
        </div>

        {/* Action buttons (right) */}
        <div className="flex gap-2 shrink-0">
          {isProcessing ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 font-bold text-xs animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Đang xử lý...
            </div>
          ) : (
            <>
              <button
                onClick={onProcess}
                disabled={!listFile}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  listFile
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Xử lý
              </button>
              {listFile && (
                <button
                  onClick={onReset}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-xs bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Hủy
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
