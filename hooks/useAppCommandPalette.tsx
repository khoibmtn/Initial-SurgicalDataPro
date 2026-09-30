import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Settings,
  BarChart3,
  Search,
  Download,
  Minimize2,
  Rows3,
  Maximize2,
} from 'lucide-react';
import { type TabKey, type CommandItem } from '../components/ui';

export interface UseAppCommandPaletteOptions {
  setActiveTab: (tab: TabKey) => void;
}

export function useAppCommandPalette({ setActiveTab }: UseAppCommandPaletteOptions) {
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const commandItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'nav-daily',
        label: 'Báo cáo hàng ngày',
        description: 'Chuyển sang tab báo cáo ngày',
        icon: <Calendar className="h-4 w-4" />,
        category: 'navigation',
        keywords: ['daily', 'ngày'],
        action: () => setActiveTab('daily'),
      },
      {
        id: 'nav-monthly',
        label: 'Báo cáo tháng',
        description: 'Chuyển sang tab báo cáo tháng',
        icon: <Calendar className="h-4 w-4" />,
        category: 'navigation',
        keywords: ['monthly', 'tháng'],
        action: () => setActiveTab('monthly'),
      },
      {
        id: 'nav-config',
        label: 'Cấu hình',
        description: 'Đi đến trang cài đặt',
        icon: <Settings className="h-4 w-4" />,
        category: 'navigation',
        keywords: ['settings', 'config'],
        action: () => setActiveTab('config'),
      },
      {
        id: 'nav-stats',
        label: 'Thống kê',
        description: 'Xem thống kê phẩu thuật',
        icon: <BarChart3 className="h-4 w-4" />,
        category: 'navigation',
        keywords: ['statistics', 'chart'],
        action: () => setActiveTab('statistics'),
      },
      {
        id: 'act-search',
        label: 'Tìm kiếm',
        description: 'Focus vào ô tìm kiếm',
        icon: <Search className="h-4 w-4" />,
        category: 'actions',
        keywords: ['search', 'find'],
        action: () => {
          const el = document.querySelector('input[placeholder*="tìm"]') as HTMLInputElement;
          el?.focus();
        },
      },
      {
        id: 'act-export',
        label: 'Xuất Excel',
        description: 'Tải xuống file Excel',
        icon: <Download className="h-4 w-4" />,
        category: 'actions',
        keywords: ['export', 'download', 'excel'],
        action: () => {
          /* trigger export from toolbar */
        },
      },
      {
        id: 'set-density-compact',
        label: 'Mật độ: Chặt',
        description: 'Hiển thị bảng nhỏ gọn',
        icon: <Minimize2 className="h-4 w-4" />,
        category: 'settings',
        keywords: ['compact', 'density'],
        action: () => localStorage.setItem('table_density', 'compact'),
      },
      {
        id: 'set-density-default',
        label: 'Mật độ: Mặc định',
        description: 'Hiển thị bảng mặc định',
        icon: <Rows3 className="h-4 w-4" />,
        category: 'settings',
        keywords: ['default', 'density'],
        action: () => localStorage.setItem('table_density', 'default'),
      },
      {
        id: 'set-density-relaxed',
        label: 'Mật độ: Rộng',
        description: 'Hiển thị bảng thoải mái',
        icon: <Maximize2 className="h-4 w-4" />,
        category: 'settings',
        keywords: ['relaxed', 'density'],
        action: () => localStorage.setItem('table_density', 'relaxed'),
      },
    ],
    [setActiveTab]
  );

  return {
    cmdPaletteOpen,
    setCmdPaletteOpen,
    commandItems,
  };
}
