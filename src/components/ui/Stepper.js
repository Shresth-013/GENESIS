import React from 'react';
import { cn } from '@/lib/utils/cn.js';
import { Check, FileText, CheckSquare, Code2, GitFork, FileCheck } from 'lucide-react';
import Link from 'next/link';

export const WORKFLOW_STEPS = [
  { id: 1, key: 'srs', label: '1. SRS Upload', icon: FileText, path: 'srs' },
  { id: 2, key: 'requirements', label: '2. Review & Approve', icon: CheckSquare, path: 'requirements' },
  { id: 3, key: 'code', label: '3. Source Code', icon: Code2, path: 'code' },
  { id: 4, key: 'matrix', label: '4. Traceability Matrix', icon: GitFork, path: 'matrix' },
  { id: 5, key: 'report', label: '5. Verification Report', icon: FileCheck, path: 'report' },
];

export function Stepper({ currentStep = 1, projectId, className }) {
  return (
    <div className={cn('w-full bg-white border border-slate-200 rounded-lg p-3 shadow-xs', className)}>
      <nav aria-label="Project Workflow Progress">
        <ol className="flex items-center justify-between text-xs font-medium">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const StepIcon = step.icon;

            const content = (
              <div className="flex items-center gap-2 group cursor-pointer select-none">
                <span
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors shrink-0 font-semibold',
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                  )}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : <StepIcon className="w-3.5 h-3.5" />}
                </span>
                <span
                  className={cn(
                    'hidden md:inline-block font-medium tracking-tight whitespace-nowrap',
                    isCurrent
                      ? 'text-blue-900 font-semibold'
                      : isCompleted
                      ? 'text-slate-800'
                      : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>
            );

            return (
              <React.Fragment key={step.id}>
                <li className="flex items-center">
                  {projectId ? (
                    <Link
                      href={`/projects/${projectId}/${step.path}`}
                      className="hover:opacity-85 transition-opacity"
                    >
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2 md:mx-4 transition-colors',
                      idx + 1 < currentStep ? 'bg-emerald-500' : 'bg-slate-200'
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

