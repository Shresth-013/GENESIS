import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queryOne, queryAll } from '@/lib/db/index.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { Alert } from '@/components/ui/Alert.js';
import { ProjectOverviewDeleteButton } from '@/components/projects/ProjectOverviewDeleteButton.js';
import {
  FileText,
  CheckSquare,
  Code2,
  GitFork,
  FileCheck,
  Calendar,
  Building2,
  Clock,
  ArrowRight,
  ShieldAlert,
  HardDrive,
  Info,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ProjectDetailsPage({ params }) {
  const { id } = params;

  // Query project from SQLite
  const project = queryOne(
    `SELECT 
      p.*,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) as total_requirements,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'APPROVED') as approved_requirements,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'PENDING') as pending_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'VERIFIED') as verified_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'PARTIALLY_IMPLEMENTED') as partial_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'NOT_IMPLEMENTED') as missing_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'UNVERIFIED') as unverified_requirements
    FROM projects p
    WHERE p.id = ?`,
    [id]
  );

  if (!project) {
    notFound();
  }

  const srsDoc = queryOne(
    `SELECT * FROM srs_documents WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
    [id]
  );

  const codeSubmission = queryOne(
    `SELECT * FROM code_submissions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
    [id]
  );

  const latestRun = queryOne(
    `SELECT * FROM verification_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`,
    [id]
  );

  const reportStats = queryOne(
    `SELECT 
      COUNT(*) as total_reports,
      MAX(generated_at) as latest_report_at
     FROM verification_reports 
     WHERE project_id = ?`,
    [id]
  );

  // Compute current workflow step (1 to 5)
  let currentStep = 1;
  if (srsDoc && project.total_requirements > 0) {
    currentStep = 2; // Requirements ready for review
  }
  if (project.approved_requirements > 0) {
    currentStep = 3; // Ready for code submission
  }
  if (codeSubmission && codeSubmission.status === 'ANALYZED') {
    currentStep = 4; // Ready for verification mapping
  }
  if (latestRun && latestRun.status === 'COMPLETED') {
    currentStep = 5; // Ready for report
  }

  const createdDate = new Date(project.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Usability Extra: Next Step Action Hint
  const totalResults =
    (project.verified_requirements || 0) +
    (project.partial_requirements || 0) +
    (project.missing_requirements || 0) +
    (project.unverified_requirements || 0);

  let nextStepHint;
  if (!srsDoc) {
    nextStepHint = {
      title: 'Next: upload your SRS document',
      description: 'Upload your software requirement specification (PDF or DOCX) to begin structural extraction.',
      href: `/projects/${id}/srs`,
      buttonText: 'Upload SRS Document',
    };
  } else if (!project.total_requirements || project.total_requirements === 0) {
    nextStepHint = {
      title: 'Next: extract and review requirements',
      description: 'Extract software requirements from your uploaded document and approve them for audit.',
      href: `/projects/${id}/requirements`,
      buttonText: 'Review Requirements',
    };
  } else if (!codeSubmission) {
    nextStepHint = {
      title: 'Next: upload your code',
      description: 'Upload developer source code as a ZIP archive for AST evidence collection.',
      href: `/projects/${id}/code`,
      buttonText: 'Upload Source Code',
    };
  } else if (totalResults === 0 && (!latestRun || latestRun.status !== 'COMPLETED')) {
    nextStepHint = {
      title: 'Next: run verification',
      description: 'Run the evidence-grounded verification audit mapping requirements to source-code evidence.',
      href: `/projects/${id}/matrix`,
      buttonText: 'Run Verification',
    };
  } else {
    nextStepHint = {
      title: 'Next: review the matrix and generate your report',
      description: 'Inspect grounded traceability results and generate your formal audit PDF report.',
      href: `/projects/${id}/report`,
      buttonText: 'Generate Audit Report',
    };
  }

  return (
    <div className="space-y-6">
      {/* Top Project Breadcrumbs & Overview */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Badge variant="brand" size="sm">
                {project.status}
              </Badge>
              <span className="text-xs font-mono text-slate-400">ID: {project.id}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-md border border-slate-200/80">
            {project.client_name && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700">{project.client_name}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Created {createdDate}</span>
            </div>
            <ProjectOverviewDeleteButton project={{ id: project.id, name: project.name }} />
          </div>
        </div>

        {/* Workflow Stepper */}
        <div className="pt-2">
          <Stepper currentStep={currentStep} projectId={project.id} />
        </div>
      </div>

      {/* Next Step Action Hint */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-md text-blue-700 shrink-0 mt-0.5">
            <ArrowRight className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-blue-950 uppercase tracking-wide">
              {nextStepHint.title}
            </h3>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              {nextStepHint.description}
            </p>
          </div>
        </div>
        <Link href={nextStepHint.href} className="shrink-0">
          <Button size="sm" variant="primary" className="bg-navy-800 hover:bg-navy-900 gap-1.5 text-xs">
            <span>{nextStepHint.buttonText}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      {/* Verification Integrity Notice */}
      <Alert variant="integrity" title="Evidence-Grounded Verification Guarantee">
        GENESIS is configured with zero-fabrication constraints. All requirement traceability mappings link to exact file paths, line ranges, and deterministic AST symbols. Code presence does not imply execution correctness, and absence of a match alone produces UNVERIFIED when evidence is insufficient.
      </Alert>

      {/* 5-Phase Workflow Action Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Phase 2: SRS Document */}
        <Card className={srsDoc ? 'border-emerald-300' : 'border-blue-300'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <Badge variant={srsDoc ? 'verified' : 'pending'} size="sm">
                {srsDoc ? 'Uploaded' : 'Phase 2 Pending'}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm">1. SRS Specification Upload</CardTitle>
            <CardDescription>
              Upload client requirements in PDF or DOCX format for Advance Genesis Model structural extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {srsDoc ? (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-800 truncate">{srsDoc.original_name}</div>
                <div className="text-slate-500 text-[11px]">
                  Size: {(srsDoc.file_size / 1024).toFixed(1)} KB • Status: {srsDoc.status}
                </div>
              </div>
            ) : (
              <div className="text-slate-400 italic">No SRS document uploaded yet.</div>
            )}
          </CardContent>
          <CardFooter>
            <Link href={`/projects/${project.id}/srs`} className="w-full">
              <Button size="sm" variant={srsDoc ? 'outline' : 'primary'} className="w-full">
                {srsDoc ? 'Manage Document' : 'Upload SRS Document'}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Phase 2b: Requirements Approval */}
        <Card className={project.approved_requirements > 0 ? 'border-emerald-300' : 'border-slate-200'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <Badge variant={project.approved_requirements > 0 ? 'verified' : 'default'} size="sm">
                {project.approved_requirements > 0 ? `${project.approved_requirements} Approved` : 'Pending'}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm">2. Requirements Review & Approval</CardTitle>
            <CardDescription>
              Human-in-the-loop review of Advance Genesis Model-extracted requirements, categories, and acceptance priorities.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Total Extracted:</span>
              <span className="font-semibold text-slate-800">{project.total_requirements}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Approved for Verification:</span>
              <span className="font-semibold text-emerald-700">{project.approved_requirements}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500">Awaiting Approval:</span>
              <span className="font-semibold text-amber-700">{project.pending_requirements || 0}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Link href={`/projects/${project.id}/requirements`} className="w-full">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={project.total_requirements === 0}
              >
                Review Requirements
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Phase 3: Developer Source Code */}
        <Card className={codeSubmission ? 'border-emerald-300' : 'border-slate-200'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <Badge variant={codeSubmission ? 'verified' : 'default'} size="sm">
                {codeSubmission ? 'Analyzed' : 'Phase 3 Pending'}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm">3. Developer Source-Code ZIP</CardTitle>
            <CardDescription>
              Secure extraction and static AST analysis collecting functions, classes, routes and tests.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {codeSubmission ? (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 truncate">{codeSubmission.filename}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">
                    v{codeSubmission.version}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px]">
                  Files: {codeSubmission.analyzed_files || codeSubmission.total_files} • Lines: {codeSubmission.total_lines}
                </div>
                <div className="text-navy-700 font-semibold text-[11px] pt-0.5">
                  Evidence Records: {codeSubmission.evidence_count || 0}
                </div>
              </div>
            ) : (
              <div className="text-slate-400 italic">No developer ZIP submission uploaded yet.</div>
            )}
          </CardContent>
          <CardFooter>
            <Link href={`/projects/${project.id}/code`} className="w-full">
              <Button
                size="sm"
                variant={codeSubmission ? 'outline' : 'primary'}
                className="w-full"
              >
                {codeSubmission ? 'View Code Artifacts' : 'Upload Source ZIP'}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Phase 4: Traceability Matrix */}
        <Card className={latestRun ? 'border-emerald-300' : 'border-slate-200'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <GitFork className="w-4 h-4" />
              </div>
              <Badge variant={latestRun ? 'verified' : 'default'} size="sm">
                {latestRun ? `Audited (${latestRun.status})` : 'Phase 4 Ready'}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm">4. Traceability & Evidence Matrix</CardTitle>
            <CardDescription>
              Maps requirements to code evidence and computes VERIFIED, PARTIAL, NOT_IMPL or UNVERIFIED status.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge status="VERIFIED" size="sm">
                {project.verified_requirements || 0} Verified
              </Badge>
              <Badge status="PARTIALLY_IMPLEMENTED" size="sm">
                {project.partial_requirements || 0} Partial
              </Badge>
              <Badge status="NOT_IMPLEMENTED" size="sm">
                {project.missing_requirements || 0} Missing
              </Badge>
              <Badge status="UNVERIFIED" size="sm">
                {project.unverified_requirements || 0} Unverified
              </Badge>
            </div>
            {latestRun && (
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                <span>Last verified:</span>
                <span className="font-medium text-slate-700">{new Date(latestRun.started_at).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href={`/projects/${project.id}/matrix`} className="w-full">
              <Button
                size="sm"
                variant={latestRun ? 'outline' : 'primary'}
                className="w-full"
                disabled={!codeSubmission || codeSubmission.status !== 'ANALYZED'}
              >
                {latestRun ? 'Open Traceability Matrix' : 'Run Verification Audit'}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Phase 5: PDF Verification Report */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FileCheck className="w-4 h-4" />
              </div>
              <Badge variant={reportStats?.total_reports > 0 ? 'success' : 'default'} size="sm">
                {reportStats?.total_reports > 0 ? `${reportStats.total_reports} Generated` : 'Phase 5'}
              </Badge>
            </div>
            <CardTitle className="mt-2 text-sm">5. Audit Verification PDF Report</CardTitle>
            <CardDescription>
              Export an academic, audit-grade verification report with citations, evidence lines, and limitations.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Generates an executive-ready PDF report compiling all requirement statuses, code evidence citations, and verified test results.
            </p>
            {reportStats?.latest_report_at && (
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                <span>Latest report:</span>
                <span className="font-medium text-slate-700">{new Date(reportStats.latest_report_at).toLocaleDateString()}</span>
              </div>
            )}
            {!reportStats?.latest_report_at && latestRun && latestRun.status === 'COMPLETED' && (
              <div className="text-[11px] text-emerald-600 pt-1 border-t border-slate-100 flex items-center gap-1 font-medium">
                <span>Ready for audit report generation</span>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href={`/projects/${project.id}/report`} className="w-full">
              <Button
                size="sm"
                variant={reportStats?.total_reports > 0 ? 'outline' : 'primary'}
                className="w-full"
                disabled={!latestRun || latestRun.status !== 'COMPLETED'}
              >
                {reportStats?.total_reports > 0 ? 'View & Generate Reports' : 'Generate Audit Report'}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

