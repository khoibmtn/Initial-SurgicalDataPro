import React from 'react';

interface ContextToolbarProps {
  title: string | React.ReactNode;
  beforeTitle?: React.ReactNode;
  children?: React.ReactNode;
}

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  title,
  beforeTitle,
  children,
}) => {
  return (
    <div className="sticky top-0 z-20 fb-page-header">
      <div className="flex items-center justify-between">
        <div className="min-w-0 shrink-0 flex items-center gap-2.5">
          {beforeTitle}
          {typeof title === 'string' ? <h2 className="fb-page-title">{title}</h2> : title}
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
