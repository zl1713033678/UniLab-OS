import React from 'react';
import {
  CheckCircle2,
  Clock,
  Activity,
  AlertOctagon,
  XCircle,
  Lock,
  Unlock,
} from 'lucide-react';

const STATUS_MAP = {
  IDLE: {
    label: '空闲待命',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
  },
  RESERVED: {
    label: '已预约',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  ACTIVE: {
    label: '使用中',
    cls: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Activity,
  },
  RUNNING: {
    label: '高负载运行',
    cls: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Activity,
  },
  OVERTIME_RUNNING: {
    label: '超时运行',
    cls: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: AlertOctagon,
  },
  FAULT: {
    label: '故障/违规断电',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: AlertOctagon,
  },
  COMPLETED: {
    label: '已结算/完成',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
  },
  REGISTERED: {
    label: '待检测',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  PROCESSING: {
    label: '检测中',
    cls: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Activity,
  },
  CANCELLED: {
    label: '已取消',
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: XCircle,
  },
  CONFIDENTIAL: {
    label: '保密隔离',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: Lock,
  },
  OPEN: {
    label: '公共开放',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Unlock,
  },
};

export default function StatusBadge({ status, suffix = '', showCode = true }) {
  const cfg = STATUS_MAP[status] || {
    label: status || '-',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Clock,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${cfg.cls}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
      {showCode && status && !['CONFIDENTIAL', 'OPEN'].includes(status) && (
        <span className="font-mono text-[10px] opacity-75">({status})</span>
      )}
      {suffix && <span className="font-mono font-semibold ml-0.5">{suffix}</span>}
    </span>
  );
}
