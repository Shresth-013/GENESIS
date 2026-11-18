'use client';

import React from 'react';
import { Modal } from './Modal.js';
import { Badge } from './Badge.js';
import { Button } from './Button.js';
import { Info, Sparkles } from 'lucide-react';

export function PreviewModal({
  isOpen,
  onClose,
  title,
  subtitle = 'Preview feature, coming in a future release',
  bullets = [],
  description,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <Badge variant="warning" size="sm">
            Preview
          </Badge>
        </span>
      }
      description={subtitle}
      maxWidth="max-w-md"
    >
      <div className="p-5 space-y-4">
        {description && (
          <p className="text-xs text-slate-600 leading-relaxed">
            {description}
          </p>
        )}

        {bullets.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <h4 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Planned Capabilities
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            This preview feature is coming in a future release and is not fully working in this build. No external network calls or modifications are made.
          </span>
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
