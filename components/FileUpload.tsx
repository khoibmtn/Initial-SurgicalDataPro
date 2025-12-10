import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  accept?: string;
  compact?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ label, file, onFileSelect, accept = ".xlsx, .xls", compact = false }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full h-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className={`relative border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors h-full
          ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
          ${compact ? 'p-3' : 'p-6'}
        `}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        {file ? (
          <div className="text-center w-full">
            <CheckCircle className={`${compact ? 'w-6 h-6' : 'w-10 h-10'} text-green-500 mx-auto mb-1`} />
            <p className={`font-medium text-gray-900 truncate ${compact ? 'text-xs max-w-[120px]' : 'text-sm max-w-[200px]'}`}>{file.name}</p>
          </div>
        ) : (
          <div className="text-center">
            <FileSpreadsheet className={`${compact ? 'w-6 h-6' : 'w-10 h-10'} text-gray-400 mx-auto ${compact ? 'mb-1' : 'mb-2'}`} />
            {!compact && (
              <>
                <p className="text-sm text-gray-600">Drag & drop or click</p>
                <p className="text-xs text-gray-400 mt-1">Excel Files Only</p>
              </>
            )}
            {compact && <p className="text-xs text-gray-400">Chọn file...</p>}
          </div>
        )}
      </div>
    </div>
  );
};
