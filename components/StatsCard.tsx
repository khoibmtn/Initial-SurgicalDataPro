import React from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  alert?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon, alert }) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex items-center space-x-4 ${alert ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
      <div className={`p-3 rounded-full ${alert ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className={`text-2xl font-bold ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      </div>
    </div>
  );
};
