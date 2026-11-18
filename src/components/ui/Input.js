import React from 'react';
import { cn } from '@/lib/utils/cn.js';

export const Input = React.forwardRef(({
  label,
  error,
  helperText,
  id,
  className,
  required,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        required={required}
        className={cn(
          'w-full px-3 py-2 text-sm text-slate-900 bg-white border rounded-md transition-colors',
          'placeholder:text-slate-400 placeholder:text-xs',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600',
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-slate-300 hover:border-slate-400',
          'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';

