import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Command, Search, X, ArrowRight } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'navigation' | 'actions' | 'settings';
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  commands: CommandItem[];
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Điều hướng',
  actions: 'Hành động',
  settings: 'Cài đặt',
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({ commands, isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description?.toLowerCase().includes(lower) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(lower))
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { [key: string]: CommandItem[] } = {};
    filtered.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const items: CommandItem[] = [];
    const entries = Object.values(grouped) as CommandItem[][];
    entries.forEach(group => items.push(...group));
    return items;
  }, [grouped]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatList[selectedIndex]) {
      e.preventDefault();
      flatList[selectedIndex].action();
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Command className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Nhập lệnh hoặc tìm kiếm..."
            className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 rounded border border-gray-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
          {flatList.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Không tìm thấy lệnh phù hợp
            </div>
          ) : (
            (Object.entries(grouped) as [string, CommandItem[]][]).map(([category, items]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {CATEGORY_LABELS[category] || category}
                </div>
                {items.map(cmd => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={cmd.id}
                      data-cmd-idx={idx}
                      onClick={() => { cmd.action(); onClose(); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                        idx === selectedIndex
                          ? 'bg-primary-50 text-primary-800'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {cmd.icon && (
                        <span className={`shrink-0 ${idx === selectedIndex ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                          {cmd.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-[10px] text-gray-400 truncate mt-0.5">{cmd.description}</div>
                        )}
                      </div>
                      {idx === selectedIndex && (
                        <ArrowRight className="h-3.5 w-3.5 text-primary-400 shrink-0 animate-in fade-in duration-100" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">↑↓</kbd> di chuyển
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">↵</kbd> chọn
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">⌘K</kbd> bật/tắt
          </span>
        </div>
      </div>
    </div>
  );
};
