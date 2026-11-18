'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/utils/cn.js';

export function ProjectNav({ project, children }) {
  const pathname = usePathname();
  const projectId = project.id;

  const isOverview = pathname === `/projects/${projectId}`;

  const tabs = [
    { name: 'Overview', href: `/projects/${projectId}`, exact: true },
    { name: 'SRS', href: `/projects/${projectId}/srs` },
    { name: 'Requirements', href: `/projects/${projectId}/requirements` },
    { name: 'Code', href: `/projects/${projectId}/code` },
    { name: 'Matrix', href: `/projects/${projectId}/matrix` },
    { name: 'Report', href: `/projects/${projectId}/report` },
  ];

  const workflowSteps = [
    { key: 'srs', name: 'SRS', href: `/projects/${projectId}/srs` },
    { key: 'requirements', name: 'Requirements', href: `/projects/${projectId}/requirements` },
    { key: 'code', name: 'Code', href: `/projects/${projectId}/code` },
    { key: 'matrix', name: 'Matrix', href: `/projects/${projectId}/matrix` },
    { key: 'report', name: 'Report', href: `/projects/${projectId}/report` },
  ];

  let currentStepIdx = -1;
  for (let i = 0; i < workflowSteps.length; i++) {
    if (pathname.startsWith(workflowSteps[i].href)) {
      currentStepIdx = i;
      break;
    }
  }

  // Previous button: hidden on SRS (step 0) and Overview
  const prevStep = currentStepIdx > 0 ? workflowSteps[currentStepIdx - 1] : null;

  // Next button: hidden on Report (last step). On Overview, points to SRS (step 0).
  const nextStep =
    currentStepIdx === -1
      ? workflowSteps[0]
      : currentStepIdx < workflowSteps.length - 1
      ? workflowSteps[currentStepIdx + 1]
      : null;

  return (
    <div className="space-y-6">
      {/* Top Project Navigation Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        {/* Back Link */}
        <div>
          {isOverview ? (
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Projects
            </Link>
          ) : (
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Project Overview
            </Link>
          )}
        </div>

        {/* Project Name Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            {project.client_name && (
              <p className="text-xs text-slate-500 font-medium">
                Client: <span className="text-slate-700">{project.client_name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Tab Bar with Horizontal Scrolling */}
        <div className="border-b border-slate-200 overflow-x-auto scrollbar-none pt-1">
          <nav className="flex space-x-6 min-w-max" aria-label="Project Tabs">
            {tabs.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    'py-2.5 text-xs md:text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-blue-600 text-blue-600 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  )}
                >
                  {tab.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Page Content */}
      {children}

      {/* Bottom Step Navigation */}
      {(prevStep || nextStep) && (
        <div className="pt-6 border-t border-slate-200 flex items-center justify-between gap-4 mt-8">
          <div>
            {prevStep ? (
              <Link href={prevStep.href}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs text-slate-700">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Previous step
                </Button>
              </Link>
            ) : (
              <div />
            )}
          </div>

          <div>
            {nextStep && (
              <Link href={nextStep.href}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs text-slate-700">
                  Next step
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
