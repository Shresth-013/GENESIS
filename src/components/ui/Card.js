import React from 'react';
import { cn } from '@/lib/utils/cn.js';

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 shadow-sm transition-shadow',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn('px-6 py-4 border-b border-slate-100 flex flex-col gap-1', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3
      className={cn('text-base font-semibold text-slate-900 leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn('text-xs text-slate-500 font-normal leading-relaxed', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn('px-6 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between rounded-b-lg', className)}
      {...props}
    >
      {children}
    </div>
  );
}

