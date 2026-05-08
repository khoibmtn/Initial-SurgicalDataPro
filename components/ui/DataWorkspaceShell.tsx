import React from 'react';

interface DataWorkspaceShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Layout wrapper for Operational pages (Daily, Monthly).
 * Uses compact density: p-4 gap-3.
 * Children should be: ContextToolbar, KPIBar, FilterPills, Table content, etc.
 * 
 * This shell establishes the scroll architecture:
 * - The shell itself fills available height (flex-1)
 * - Content is arranged in a column
 * - Only the table body scrolls (handled by table component itself)
 */
export const DataWorkspaceShell: React.FC<DataWorkspaceShellProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {children}
    </div>
  );
};
