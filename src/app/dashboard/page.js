import React from 'react';
import Link from 'next/link';
import { queryOne, queryAll } from '@/lib/db/index.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import {
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Plus,
  ShieldCheck,
  ArrowRight,
  FileText,
  Code2,
  Cpu,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  // Fetch real statistics directly from SQLite
  const projectStats = {
    ...(queryOne(`
    SELECT 
      COUNT(*) as total_projects,
      SUM(CASE WHEN status = 'CREATED' THEN 1 ELSE 0 END) as created_count,
      SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified_count
    FROM projects
  `) || { total_projects: 0, created_count: 0, verified_count: 0 }),
  };

  const requirementStats = {
    ...(queryOne(`
    SELECT 
      COUNT(*) as total_requirements,
      SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count
    FROM requirements
  `) || { total_requirements: 0, approved_count: 0, pending_count: 0 }),
  };

  const verificationStats = {
    ...(queryOne(`
    SELECT 
      COUNT(*) as total_verified_evals,
      SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'PARTIALLY_IMPLEMENTED' THEN 1 ELSE 0 END) as partially_implemented,
      SUM(CASE WHEN status = 'NOT_IMPLEMENTED' THEN 1 ELSE 0 END) as not_implemented,
      SUM(CASE WHEN status = 'UNVERIFIED' THEN 1 ELSE 0 END) as unverified
    FROM verification_results
  `) || { total_verified_evals: 0, verified: 0, partially_implemented: 0, not_implemented: 0, unverified: 0 }),
  };

  const recentProjects = (queryAll(`
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) as total_requirements,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'APPROVED') as approved_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'VERIFIED') as verified_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'PARTIALLY_IMPLEMENTED') as partial_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'NOT_IMPLEMENTED') as missing_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'UNVERIFIED') as unverified_requirements
    FROM projects p
    ORDER BY p.updated_at DESC
    LIMIT 5
  `) || []).map((r) => ({ ...r }));

  const totalEvals = verificationStats.total_verified_evals || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Verification & Traceability Executive Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Evidence-grounded audit platform for client SRS specifications and developer source-code submissions.
          </p>
        </div>

        <Link href="/projects/new">
          <Button size="sm" variant="primary" icon={Plus}>
            New Project
          </Button>
        </Link>
      </div>

      {/* Critical Integrity Disclaimer Banner */}
      <Alert variant="integrity" title="Framework Integrity Standard">
        GENESIS enforces strict zero-hallucination verification. Code presence alone does not guarantee correct functionality, and absence of a code match alone does not prove non-implementation. All inferences are paired with deterministic source-code evidence (file paths, line numbers, AST identifiers).
      </Alert>

      {/* High-Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Projects</span>
            <FolderGit2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{projectStats.total_projects}</span>
            <span className="text-[11px] text-slate-400 font-normal">persisted in SQLite</span>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Parsed Requirements</span>
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{requirementStats.total_requirements}</span>
            <span className="text-[11px] text-emerald-600 font-medium">
              {requirementStats.approved_count} Approved
            </span>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Grounded Verifications</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{verificationStats.verified}</span>
            <span className="text-[11px] text-slate-500">
              {totalEvals > 0 ? `${Math.round((verificationStats.verified / totalEvals) * 100)}% of audited` : 'None audited'}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Incomplete / Unverified</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {verificationStats.partially_implemented + verificationStats.not_implemented + verificationStats.unverified}
            </span>
            <span className="text-[11px] text-amber-700 font-medium">
              Flagged for review
            </span>
          </div>
        </Card>
      </div>

      {/* Verification Status Distribution Table / Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Evidence Status Distribution</CardTitle>
              <CardDescription>
                Canonical classification of software requirements mapped against uploaded source code.
              </CardDescription>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Total Audited: {totalEvals}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
              <div className="flex items-center justify-between">
                <Badge status="VERIFIED" size="sm" />
                <span className="text-lg font-bold text-emerald-800">{verificationStats.verified}</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-2">
                Requirements with verified deterministic code evidence and matching functional logic.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200/80">
              <div className="flex items-center justify-between">
                <Badge status="PARTIALLY_IMPLEMENTED" size="sm" />
                <span className="text-lg font-bold text-amber-800">{verificationStats.partially_implemented}</span>
              </div>
              <p className="text-[11px] text-amber-700 mt-2">
                Requirements where partial code stubs or incomplete logic are present.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-rose-50/50 border border-rose-200/80">
              <div className="flex items-center justify-between">
                <Badge status="NOT_IMPLEMENTED" size="sm" />
                <span className="text-lg font-bold text-rose-800">{verificationStats.not_implemented}</span>
              </div>
              <p className="text-[11px] text-rose-700 mt-2">
                Requirements with verified absence of code, endpoints, models, or test suites.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-100/70 border border-slate-300/80">
              <div className="flex items-center justify-between">
                <Badge status="UNVERIFIED" size="sm" />
                <span className="text-lg font-bold text-slate-800">{verificationStats.unverified}</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                Requirements where submitted code provides insufficient deterministic evidence to judge.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Projects Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Verification Projects</CardTitle>
              <CardDescription>
                Recently modified verification workspaces and their current status.
              </CardDescription>
            </div>
            <Link href="/projects" className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              View all projects
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentProjects.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {project.name}
                      </Link>
                      <Badge variant="brand" size="sm">
                        {project.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Client: {project.client_name || 'Internal'}</span>
                      <span>•</span>
                      <span>Requirements: {project.total_requirements}</span>
                      <span>•</span>
                      <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <Link href={`/projects/${project.id}`}>
                    <Button size="xs" variant="outline">
                      Open Project
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 px-4 space-y-3">
              <FolderGit2 className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-slate-700">No Projects Found</p>
                <p className="text-xs text-slate-500">
                  Create your first project to begin software requirement traceability and verification.
                </p>
              </div>
              <Link href="/projects/new">
                <Button size="sm" variant="primary" icon={Plus}>
                  Create First Project
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

