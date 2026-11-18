import React from 'react';
import { cn } from '@/lib/utils/cn.js';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock, Check } from 'lucide-react';

export function Badge({
  children,
  variant = 'default',
  status,
  size = 'md',
  className,
  showIcon = true,
}) {
  let badgeVariant = variant;
  let Icon = null;
  let label = children;

  // Canonical verification statuses
  if (status) {
    const s = String(status).toUpperCase();
    if (s === 'VERIFIED') {
      badgeVariant = 'verified';
      Icon = CheckCircle2;
      label = label || 'VERIFIED';
    } else if (s === 'PARTIALLY_IMPLEMENTED' || s === 'PARTIAL') {
      badgeVariant = 'partial';
      Icon = AlertTriangle;
      label = label || 'PARTIAL';
    } else if (s === 'NOT_IMPLEMENTED' || s === 'MISSING') {
      badgeVariant = 'missing';
      Icon = XCircle;
      label = label || 'NOT IMPLEMENTED';
    } else if (s === 'UNVERIFIED') {
      badgeVariant = 'unverified';
      Icon = HelpCircle;
      label = label || 'UNVERIFIED';
    } else if (s === 'APPROVED') {
      badgeVariant = 'approved';
      Icon = Check;
      label = label || 'APPROVED';
    } else if (s === 'PENDING') {
      badgeVariant = 'pending';
      Icon = Clock;
      label = label || 'PENDING';
    } else if (s === 'COMPLETED') {
      badgeVariant = 'success';
      Icon = CheckCircle2;
      label = label || 'COMPLETED';
    }
  }

  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    verified: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-600/10 font-semibold',
    partial: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-600/10 font-semibold',
    missing: 'bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-600/10 font-semibold',
    unverified: 'bg-slate-100 text-slate-700 border-slate-300 ring-1 ring-slate-600/10 font-medium',
    approved: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
    pending: 'bg-yellow-50 text-yellow-800 border-yellow-200 font-medium',
    brand: 'bg-blue-50 text-blue-700 border-blue-200',
    outline: 'bg-transparent text-slate-600 border-slate-300',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
    navy: 'bg-[#0f172a] text-blue-300 border-slate-700 font-semibold',
    slate: 'bg-slate-100 text-slate-600 border-slate-200 font-medium',
    warning: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
    danger: 'bg-rose-50 text-rose-800 border-rose-200 font-medium',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
    lg: 'text-sm px-3 py-1 gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border transition-colors select-none font-sans',
        variants[badgeVariant] || variants.default,
        sizes[size],
        className
      )}
    >
      {showIcon && Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </span>
  );
}

