import React from 'react';

interface ContextToolbarProps {
  title: string;
  children?: React.ReactNode;
}

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  title,
  children,
}) => {
  return (
    <div className="sticky top-0 z-20 fb-page-header">
      <div className="flex items-center justify-between">
        <div className="min-w-0 shrink-0">
          <h2 className="fb-page-title">{title}</h2>
        </div>
      </div>
      {children && (
        <div className="flex items-center min-w-0">
          {children}
        </div>
      )}
    </div>
  );
};
