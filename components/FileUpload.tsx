import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  accept?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ label, file, onFileSelect, accept = ".xlsx, .xls" }) => {
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
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div 
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors
          ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}`}
      >
        <input 
          type="file" 
          accept={accept}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        {file ? (
          <div className="text-center">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{file.name}</p>
            <p className="text-xs text-gray-500">Ready to process</p>
          </div>
        ) : (
          <div className="text-center">
            <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drag & drop or click to upload</p>
            <p className="text-xs text-gray-400 mt-1">Excel Files Only</p>
          </div>
        )}
      </div>
    </div>
  );
};
