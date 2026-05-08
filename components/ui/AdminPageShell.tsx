import React from 'react';

interface AdminPageShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Layout wrapper for Admin/Config pages.
 * Uses spacious density: p-6 gap-6.
 * Scrolls the full content area (unlike DataWorkspaceShell).
 */
export const AdminPageShell: React.FC<AdminPageShellProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`flex flex-col h-full overflow-y-auto p-6 space-y-6 ${className}`}>
      {children}
    </div>
  );
};
