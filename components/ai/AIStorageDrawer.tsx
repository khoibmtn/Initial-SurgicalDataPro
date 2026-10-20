import React, { useState } from 'react';
import { X, Minus, Bot, Loader2, MessageSquare } from 'lucide-react';
import { AISlotId } from '../../types/ai';
import { AIDataContextInput } from '../../services/ai/aiQueryEngine';
import { AIChatWorkspace, AIChatSessionStatus } from './AIChatWorkspace';

interface AIStorageDrawerProps {
  isOpen: boolean;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
  slotId: AISlotId;
  dataContext: AIDataContextInput;
  onOpenAIConfigTab?: () => void;
  onRequestLoadData?: () => void;
  isLoadingExternalData?: boolean;
}

export const AIStorageDrawer: React.FC<AIStorageDrawerProps> = ({
  isOpen,
  isMinimized = false,
  onMinimize,
  onRestore,
  onClose,
  slotId,
  dataContext,
  onOpenAIConfigTab,
  onRequestLoadData,
  isLoadingExternalData = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<AIChatSessionStatus>({
    messageCount: 0,
    artifactCount: 0,
    isGenerating: false,
    lastMessagePreview: '',
  });

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      onClose();
    }
  };

  const slotShortLabel =
    slotId === 'daily_storage' ? 'BC Hàng ngày (Lưu trữ)' : 'BC Tháng (Lưu trữ)';

  return (
    <>
      {/* Full Drawer Overlay (kept mounted via CSS hidden when minimized or closed so state/requests never reset) */}
      <div
        className={`fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-[1px] animate-fade-in ${
          isOpen && !isMinimized ? '' : 'hidden pointer-events-none'
        }`}
      >
        {/* Backdrop click to minimize (so user can inspect underlying data and restore anytime) */}
        <div
          className="flex-1"
          onClick={handleMinimize}
          title="Bấm ra ngoài để thu nhỏ cửa sổ AI xuống góc màn hình"
        />

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
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="text-xs font-bold tracking-tight truncate">
                Trợ lý Phân tích Dữ liệu AI — {slotShortLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleMinimize}
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                title="Thu nhỏ xuống góc màn hình (như Messenger) để xem bảng dữ liệu bên dưới"
              >
                <Minus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Thu nhỏ</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Đóng cửa sổ Trợ lý AI (lịch sử vẫn được lưu tự động)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
              onStatusChange={setSessionStatus}
              onRequestLoadData={onRequestLoadData}
              isLoadingExternalData={isLoadingExternalData}
            />
          </div>
        </div>
      </div>

      {/* Messenger-style Minimized Floating Bubble / Banner at Bottom-Right */}
      {isOpen && isMinimized && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-slate-900 text-white p-1.5 pr-2.5 rounded-full shadow-2xl border border-slate-700 hover:border-sky-400 transition-all animate-fade-in">
          <button
            type="button"
            onClick={onRestore}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
            title="Bấm để mở lại cửa sổ Trợ lý AI"
          >
            {/* Circular Avatar Icon with Badge */}
            <div className="relative h-10 w-10 rounded-full bg-sky-600 group-hover:bg-sky-500 flex items-center justify-center shrink-0 shadow-md transition-colors">
              {sessionStatus.isGenerating ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Bot className="h-5 w-5 text-white" />
              )}

              {/* Message Count Badge */}
              {sessionStatus.messageCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-slate-900">
                  {sessionStatus.messageCount}
                </span>
              )}
            </div>

            {/* Compact Banner Info */}
            <div className="hidden sm:flex flex-col min-w-0 max-w-[215px] pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  Trợ lý AI • {slotId === 'daily_storage' ? 'BC Ngày' : 'BC Tháng'}
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              </div>
              <span className="text-[11px] text-slate-300 truncate flex items-center gap-1">
                {sessionStatus.isGenerating ? (
                  'Đang phân tích số liệu...'
                ) : sessionStatus.lastMessagePreview ? (
                  sessionStatus.lastMessagePreview
                ) : (
                  <>
                    <MessageSquare className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                    <span>Bấm để mở lại khung chat</span>
                  </>
                )}
              </span>
            </div>
          </button>

          {/* Dismiss Minimized Bubble Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Ẩn bong bóng chat (lịch sử vẫn được lưu)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
