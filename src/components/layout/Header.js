'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button.js';
import { Plus, ShieldAlert, Sparkles, ChevronRight } from 'lucide-react';

export function Header({ onOpenNewProjectModal, aiMode = 'LIVE' }) {
  const pathname = usePathname();
  const isLive = !aiMode || aiMode === 'LIVE';

  // Cache for project names fetched by project ID
  const [projectNames, setProjectNames] = useState({});
  const [loadingProjects, setLoadingProjects] = useState({});

  // Generate dynamic breadcrumb segments
  const segments = pathname.split('/').filter(Boolean);

  const projectsIdx = segments.indexOf('projects');
  const currentProjectId =
    projectsIdx !== -1 && segments.length > projectsIdx + 1 && segments[projectsIdx + 1] !== 'new'
      ? segments[projectsIdx + 1]
      : null;

  useEffect(() => {
    if (!currentProjectId) return;
    if (projectNames[currentProjectId]) return;

    let isMounted = true;
    setLoadingProjects((prev) => ({ ...prev, [currentProjectId]: true }));

    fetch(`/api/projects/${currentProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.data?.name) {
          setProjectNames((prev) => ({ ...prev, [currentProjectId]: data.data.name }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) {
          setLoadingProjects((prev) => ({ ...prev, [currentProjectId]: false }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId]);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
      {/* Breadcrumbs & Title */}
      <div className="flex items-center gap-2 text-xs text-slate-500 overflow-hidden">
        <Link href="/dashboard" className="hover:text-slate-900 transition-colors font-medium shrink-0">
          GENESIS
        </Link>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const href = '/' + segments.slice(0, i + 1).join('/');
          const isProjectId = i > 0 && segments[i - 1] === 'projects' && seg !== 'new';

          let label = seg.replace(/-/g, ' ');
          if (isProjectId) {
            if (projectNames[seg]) {
              label = projectNames[seg];
            } else if (loadingProjects[seg]) {
              label = '...';
            } else {
              label = seg;
            }
          }

          return (
            <React.Fragment key={href}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {isLast ? (
                <span className="font-semibold text-slate-900 capitalize truncate max-w-[200px]">
                  {label}
                </span>
              ) : (
                <Link
                  href={href}
                  className="hover:text-slate-900 transition-colors capitalize truncate max-w-[150px]"
                >
                  {label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Action Area */}
      <div className="flex items-center gap-3">
        {/* Model Status Chip */}
        {isLive ? (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Advance Genesis Model · Online</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span>Base Genesis Model · Active</span>
          </div>
        )}

        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Strict Evidence-Grounded Verification Mode</span>
        </div>

        {onOpenNewProjectModal ? (
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            onClick={onOpenNewProjectModal}
          >
            Create Project
          </Button>
        ) : (
          <Link href="/projects/new">
            <Button size="sm" variant="primary" icon={Plus}>
              Create Project
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}

