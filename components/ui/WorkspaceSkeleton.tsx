import React from 'react';

/** Animated skeleton pulse block */
const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-gray-200/70 rounded animate-pulse ${className}`} />
);

/**
 * WorkspaceSkeleton — fills the data area while content is loading.
 * Mimics KPI bar + table layout for a seamless perceived-performance effect.
 */
export const WorkspaceSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 px-4 py-3 animate-fade-in">
    {/* KPI strip skeleton */}
    <div className="flex gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex-1 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
          <Bone className="h-7 w-7 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-2.5 w-12" />
            <Bone className="h-4 w-8" />
          </div>
        </div>
      ))}
    </div>

    {/* Tab bar skeleton */}
    <div className="flex gap-2 mt-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Bone key={i} className={`h-7 rounded-md ${i === 1 ? 'w-28' : 'w-20'}`} />
      ))}
    </div>

    {/* Table skeleton */}
    <div className="border border-gray-100 rounded-lg overflow-hidden mt-1">
      {/* Header */}
      <div className="flex gap-2 bg-gray-100/80 px-4 py-2.5">
        <Bone className="h-3 w-8" />
        {[120, 80, 160, 100, 60, 80, 100].map((w, i) => (
          <Bone key={i} className="h-3 flex-1" style={{ maxWidth: w }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: 8 }).map((_, row) => (
        <div key={row} className={`flex gap-2 px-4 py-2.5 ${row % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
          <Bone className="h-3 w-8" />
          {[120, 80, 160, 100, 60, 80, 100].map((w, i) => (
            <Bone key={i} className="h-3 flex-1" style={{ maxWidth: w + Math.random() * 20 - 10 }} />
          ))}
        </div>
      ))}
    </div>
  </div>
);
