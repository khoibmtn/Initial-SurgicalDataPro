import React from 'react';
import { Database, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Database,
  title = 'Chưa có dữ liệu',
  description = 'Chọn nguồn dữ liệu và nhấn "Lấy dữ liệu" để bắt đầu.',
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="p-4 rounded-2xl bg-gray-50 mb-4">
      <Icon className="h-8 w-8 text-gray-300" />
    </div>
    <h3 className="text-sm font-bold text-gray-500 mb-1">{title}</h3>
    <p className="text-xs text-gray-400 max-w-xs">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
