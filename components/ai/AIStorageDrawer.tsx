import React, { useState } from 'react';
import { X, Bot } from 'lucide-react';
import { AISlotId } from '../../types/ai';
import { AIDataContextInput } from '../../services/ai/aiQueryEngine';
import { AIChatWorkspace } from './AIChatWorkspace';

interface AIStorageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  slotId: AISlotId;
  dataContext: AIDataContextInput;
  onOpenAIConfigTab?: () => void;
}

export const AIStorageDrawer: React.FC<AIStorageDrawerProps> = ({
  isOpen,
  onClose,
  slotId,
  dataContext,
  onOpenAIConfigTab,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[1px] animate-fade-in">
      {/* Backdrop click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Sliding Drawer Panel */}
      <div
        className={`bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col transition-all duration-200 ${
          isExpanded
            ? 'w-[95vw] max-w-[1440px]'
            : 'w-full sm:w-[540px] md:w-[600px]'
        }`}
      >
        {/* Top Drawer Bar */}
        <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-bold tracking-tight">
              Trợ lý Phân tích Dữ liệu AI —{' '}
              {slotId === 'daily_storage'
                ? 'Báo cáo Hàng ngày (Lưu trữ)'
                : 'Báo cáo Tháng (Lưu trữ)'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng ngăn Trợ lý AI"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Workspace Content */}
        <div className="flex-1 min-h-0 p-2 bg-slate-100">
          <AIChatWorkspace
            slotId={slotId}
            dataContext={dataContext}
            defaultExpanded={isExpanded}
            onToggleExpand={(exp) => setIsExpanded(exp)}
            onOpenAIConfigTab={onOpenAIConfigTab}
            compactMode
          />
        </div>
      </div>
    </div>
  );
};
