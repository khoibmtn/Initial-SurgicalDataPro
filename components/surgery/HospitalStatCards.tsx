import React from 'react';
import { Activity, CreditCard, Users, Cpu, AlertTriangle, Clock } from 'lucide-react';
import { ProcessedStats } from '../../types';

export interface HospitalStatCardsProps {
  stats: ProcessedStats;
}

export const HospitalStatCards: React.FC<HospitalStatCardsProps> = ({ stats }) => {
  const cards = [
    {
      label: 'TỔNG PT/TT',
      value: stats.totalSurgeries,
      icon: <Activity className="stat-card-icon" />,
      bgFrom: '#eff6ff',
      border: '#dbeafe',
      labelColor: '#2563eb',
      iconColor: '#60a5fa',
      valueColor: '#1e3a5f',
    },
    {
      label: 'TT <100%',
      value: stats.lowPaymentCount || 0,
      icon: <CreditCard className="stat-card-icon" />,
      bgFrom: '#f8fafc',
      border: '#e2e8f0',
      labelColor: '#64748b',
      iconColor: '#94a3b8',
      valueColor: '#334155',
    },
    {
      label: 'TRÙNG NV',
      value: stats.staffConflicts,
      icon: <Users className="stat-card-icon" />,
      bgFrom: stats.staffConflicts > 0 ? '#fef2f2' : '#f0fdf4',
      border: stats.staffConflicts > 0 ? '#fecaca' : '#bbf7d0',
      labelColor: stats.staffConflicts > 0 ? '#dc2626' : '#16a34a',
      iconColor: stats.staffConflicts > 0 ? '#f87171' : '#4ade80',
      valueColor: stats.staffConflicts > 0 ? '#7f1d1d' : '#14532d',
    },
    {
      label: 'TRÙNG MÁY',
      value: stats.machineConflicts,
      icon: <Cpu className="stat-card-icon" />,
      bgFrom: stats.machineConflicts > 0 ? '#fffbeb' : '#f0fdf4',
      border: stats.machineConflicts > 0 ? '#fde68a' : '#bbf7d0',
      labelColor: stats.machineConflicts > 0 ? '#d97706' : '#16a34a',
      iconColor: stats.machineConflicts > 0 ? '#fbbf24' : '#4ade80',
      valueColor: stats.machineConflicts > 0 ? '#78350f' : '#14532d',
    },
    {
      label: 'THIẾU MÁY',
      value: stats.missingMachines,
      icon: <AlertTriangle className="stat-card-icon" />,
      bgFrom: stats.missingMachines > 0 ? '#fff7ed' : '#f0fdf4',
      border: stats.missingMachines > 0 ? '#fed7aa' : '#bbf7d0',
      labelColor: stats.missingMachines > 0 ? '#ea580c' : '#16a34a',
      iconColor: stats.missingMachines > 0 ? '#fb923c' : '#4ade80',
      valueColor: stats.missingMachines > 0 ? '#7c2d12' : '#14532d',
    },
    {
      label: 'CHƯA GV',
      value: stats.missingAssistantCount,
      icon: <Users className="stat-card-icon" />,
      bgFrom: stats.missingAssistantCount > 0 ? '#fef2f2' : '#f0fdf4',
      border: stats.missingAssistantCount > 0 ? '#fecaca' : '#bbf7d0',
      labelColor: stats.missingAssistantCount > 0 ? '#dc2626' : '#16a34a',
      iconColor: stats.missingAssistantCount > 0 ? '#f87171' : '#4ade80',
      valueColor: stats.missingAssistantCount > 0 ? '#7f1d1d' : '#14532d',
    },
    {
      label: 'LỖI TG',
      value: stats.violateMinTimeCount,
      icon: <Clock className="stat-card-icon" />,
      bgFrom: stats.violateMinTimeCount > 0 ? '#fef2f2' : '#f0fdf4',
      border: stats.violateMinTimeCount > 0 ? '#fecaca' : '#bbf7d0',
      labelColor: stats.violateMinTimeCount > 0 ? '#dc2626' : '#16a34a',
      iconColor: stats.violateMinTimeCount > 0 ? '#f87171' : '#4ade80',
      valueColor: stats.violateMinTimeCount > 0 ? '#7f1d1d' : '#14532d',
    },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 px-4 mt-1.5">
      {cards.map((card, i) => (
        <div
          key={i}
          className="stat-card"
          style={{
            '--stat-bg-from': card.bgFrom,
            '--stat-border': card.border,
            '--stat-label': card.labelColor,
            '--stat-icon': card.iconColor,
            '--stat-value': card.valueColor,
          } as React.CSSProperties}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">{card.label}</span>
            {card.icon}
          </div>
          <span className="stat-card-value">
            {typeof card.value === 'number' ? card.value.toLocaleString('vi-VN') : card.value}
          </span>
        </div>
      ))}
    </div>
  );
};
