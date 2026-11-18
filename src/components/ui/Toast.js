'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext({
  showToast: () => {},
});

let toastSubscriber = null;

export function showToast(message, type = 'success') {
  if (toastSubscriber) {
    toastSubscriber({ id: Date.now() + Math.random(), message, type });
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('genesis-toast', { detail: { message, type } })
    );
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return {
    showToast: (msg, type) => {
      if (ctx?.showToast) ctx.showToast(msg, type);
      else showToast(msg, type);
    },
  };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = ({ id = Date.now(), message, type = 'success' }) => {
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    toastSubscriber = addToast;
    const handleEvent = (e) => {
      if (e.detail?.message) addToast(e.detail);
    };
    window.addEventListener('genesis-toast', handleEvent);
    return () => {
      toastSubscriber = null;
      window.removeEventListener('genesis-toast', handleEvent);
    };
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast: (msg, type) => addToast({ id: Date.now(), message: msg, type }) }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const isError = t.type === 'error';
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-lg border text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
                isError
                  ? 'bg-rose-50 text-rose-900 border-rose-200 shadow-rose-900/5'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200 shadow-emerald-900/5'
              }`}
              role="alert"
            >
              <div className="flex items-center gap-2">
                {isError ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
