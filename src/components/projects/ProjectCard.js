'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { ArrowRight, Building2, Calendar, FileText, Code2, CheckCircle2, Trash2 } from 'lucide-react';

export function ProjectCard({ project, onDeleteClick }) {
  const formattedDate = new Date(project.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card className="hover:border-blue-300 transition-all hover:shadow-md flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <Badge variant="brand" size="sm">
              {project.status || 'CREATED'}
            </Badge>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar className="w-3 h-3" />
              {formattedDate}
            </span>
          </div>

          <Link href={`/projects/${project.id}`} className="group">
            <CardTitle className="mt-2 text-base group-hover:text-blue-600 transition-colors">
              {project.name}
            </CardTitle>
          </Link>

          {project.client_name && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mt-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{project.client_name}</span>
            </div>
          )}

          {project.description && (
            <CardDescription className="line-clamp-2 mt-1.5">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="pt-2 pb-4 space-y-3">
          {/* Artifact status row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <div>
                <span className="block font-medium text-slate-700">SRS Document</span>
                <span className="text-[11px] text-slate-500">
                  {project.srs_count > 0 ? 'Document Loaded' : 'Awaiting Upload'}
                </span>
              </div>
            </div>

            <div className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-purple-600" />
              <div>
                <span className="block font-medium text-slate-700">Source ZIP</span>
                <span className="text-[11px] text-slate-500">
                  {project.code_count > 0 ? 'Source Code Analyzed' : 'Awaiting Code'}
                </span>
              </div>
            </div>
          </div>

          {/* Verification Metrics Breakdown */}
          {project.total_requirements > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                <span>Verification Distribution</span>
                <span>{project.total_requirements} Requirements</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {project.verified_requirements > 0 && (
                  <Badge status="VERIFIED" size="sm">
                    {project.verified_requirements} Verified
                  </Badge>
                )}
                {project.partial_requirements > 0 && (
                  <Badge status="PARTIALLY_IMPLEMENTED" size="sm">
                    {project.partial_requirements} Partial
                  </Badge>
                )}
                {project.missing_requirements > 0 && (
                  <Badge status="NOT_IMPLEMENTED" size="sm">
                    {project.missing_requirements} Missing
                  </Badge>
                )}
                {project.unverified_requirements > 0 && (
                  <Badge status="UNVERIFIED" size="sm">
                    {project.unverified_requirements} Unverified
                  </Badge>
                )}
                {project.verified_requirements === 0 &&
                  project.partial_requirements === 0 &&
                  project.missing_requirements === 0 &&
                  project.unverified_requirements === 0 && (
                    <span className="text-xs text-slate-400 italic">
                      {project.approved_requirements} approved requirements ready for verification
                    </span>
                  )}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic bg-slate-50/50 p-2 rounded border border-dashed border-slate-200 text-center">
              No requirements parsed yet. Upload an SRS document to begin.
            </div>
          )}
        </CardContent>
      </div>

      <CardFooter className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-slate-400">
          ID: {project.id}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            title="Delete project"
            aria-label={`Delete project ${project.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteClick?.(project);
            }}
            icon={Trash2}
          />
          <Link href={`/projects/${project.id}`}>
            <Button size="xs" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
              Open Project
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

