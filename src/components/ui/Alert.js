import React from 'react';
import { cn } from '@/lib/utils/cn.js';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, ShieldAlert } from 'lucide-react';

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  icon: CustomIcon,
}) {
  const configs = {
    info: {
      container: 'bg-blue-50/80 border-blue-200 text-blue-900',
      icon: Info,
      iconColor: 'text-blue-600',
    },
    success: {
      container: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
    },
    warning: {
      container: 'bg-amber-50/80 border-amber-200 text-amber-900',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
    },
    danger: {
      container: 'bg-rose-50/80 border-rose-200 text-rose-900',
      icon: AlertCircle,
      iconColor: 'text-rose-600',
    },
    integrity: {
      container: 'bg-slate-900 border-slate-800 text-slate-100',
      icon: ShieldAlert,
      iconColor: 'text-amber-400',
    },
  };

  const config = configs[variant] || configs.info;
  const Icon = CustomIcon || config.icon;

  return (
    <div
      role="alert"
      className={cn(
        'border rounded-md p-4 text-xs flex items-start gap-3 transition-colors',
        config.container,
        className
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', config.iconColor)} />
      <div className="space-y-1 flex-1">
        {title && <h4 className="font-semibold text-xs tracking-tight">{title}</h4>}
        <div className="leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

