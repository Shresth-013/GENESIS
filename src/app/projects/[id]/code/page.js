'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { PreviewModal } from '@/components/ui/PreviewModal.js';
import { showToast } from '@/components/ui/Toast.js';
import {
  UploadCloud,
  FileCode,
  ShieldCheck,
  RefreshCw,
  Code2,
  FolderTree,
  FileCheck2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  ChevronRight,
  ChevronDown,
  Layers,
  Database,
  KeyRound,
  ShieldAlert,
  GitFork,
  TestTube2,
  CheckSquare,
  Hash,
  Clock,
  ArrowRight,
} from 'lucide-react';

const EVIDENCE_TYPES = [
  'ALL',
  'FUNCTION',
  'METHOD',
  'CLASS',
  'API_ENDPOINT',
  'DATABASE_OPERATION',
  'AUTHENTICATION_INDICATOR',
  'VALIDATION_INDICATOR',
  'TEST_REFERENCE',
  'OTHER',
];

export default function CodeSubmissionPage({ params }) {
  const { id: projectId } = params;
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [approvedReqCount, setApprovedReqCount] = useState(0);
  const [submissions, setSubmissions] = useState([]);
  const [activeSubmission, setActiveSubmission] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Tabs: 'evidence' | 'files' | 'history'
  const [activeTab, setActiveTab] = useState('evidence');

  // Evidence Explorer state
  const [evidenceList, setEvidenceList] = useState([]);
  const [evidencePagination, setEvidencePagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceTypeFilter, setEvidenceTypeFilter] = useState('ALL');
  const [evidenceLangFilter, setEvidenceLangFilter] = useState('ALL');
  const [evidenceSearch, setEvidenceSearch] = useState('');

  // Source Files Explorer state
  const [filesList, setFilesList] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [fileLangFilter, setFileLangFilter] = useState('ALL');

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
  }, [projectId]);

  useEffect(() => {
    if (activeSubmission?.id) {
      if (activeTab === 'evidence') {
        fetchEvidence(1);
      } else if (activeTab === 'files') {
        fetchFiles();
      }
    }
  }, [activeSubmission?.id, activeTab, evidenceTypeFilter, evidenceLangFilter]);

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      // 1. Fetch project details
      const projRes = await fetch(`/api/projects/${projectId}`);
      const projJson = await projRes.json();
      if (projJson.success) {
        setProject(projJson.data);
      }

      // 2. Fetch approved requirements count from Phase 2
      const reqRes = await fetch(`/api/projects/${projectId}/requirements?status=APPROVED`);
      const reqJson = await reqRes.json();
      if (reqJson.success) {
        setApprovedReqCount(reqJson.data?.length || 0);
      }

      // 3. Fetch submissions list
      const subRes = await fetch(`/api/projects/${projectId}/code`);
      const subJson = await subRes.json();
      if (subJson.success) {
        const subs = subJson.data || [];
        setSubmissions(subs);
        const active = subs.find((s) => s.is_active === 1) || subs[0] || null;
        setActiveSubmission(active);
      }
    } catch (err) {
      console.error('Error fetching initial code submission data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchEvidence(page = 1) {
    if (!activeSubmission?.id) return;
    setEvidenceLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });
      if (evidenceTypeFilter !== 'ALL') params.set('evidence_type', evidenceTypeFilter);
      if (evidenceLangFilter !== 'ALL') params.set('language', evidenceLangFilter);
      if (evidenceSearch.trim()) params.set('q', evidenceSearch.trim());

      const res = await fetch(`/api/projects/${projectId}/code/${activeSubmission.id}/evidence?${params}`);
      const json = await res.json();
      if (json.success) {
        setEvidenceList(json.data || []);
        setEvidencePagination(json.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
      }
    } catch (err) {
      console.error('Error fetching evidence:', err);
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function fetchFiles() {
    if (!activeSubmission?.id) return;
    setFilesLoading(true);
    try {
      const params = new URLSearchParams();
      if (fileLangFilter !== 'ALL') params.set('language', fileLangFilter);

      const res = await fetch(`/api/projects/${projectId}/code/${activeSubmission.id}/files?${params}`);
      const json = await res.json();
      if (json.success) {
        setFilesList(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setFilesLoading(false);
    }
  }

  async function handleFileUpload(file) {
    if (!file) return;
    setUploadError('');
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/projects/${projectId}/code`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Upload failed');
      }

      // Refresh submissions
      await fetchInitialData();
      setActiveTab('evidence');
      showToast(`Source code archive "${file.name}" uploaded successfully`, 'success');
    } catch (err) {
      setUploadError(err.message);
      showToast(err.message || 'Failed to upload code archive', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleReanalyze() {
    if (!activeSubmission?.id) return;
    setIsReanalyzing(true);
    setUploadError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/code/${activeSubmission.id}/analyze`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Re-analysis failed');
      }

      await fetchInitialData();
      fetchEvidence(1);
    } catch (err) {
      setUploadError(`Re-analysis error: ${err.message}`);
    } finally {
      setIsReanalyzing(false);
    }
  }

  async function handleActivateSubmission(subId) {
    try {
      const res = await fetch(`/api/projects/${projectId}/code/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: 1 }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchInitialData();
      }
    } catch (err) {
      console.error('Error activating submission:', err);
    }
  }

  function getEvidenceBadgeColor(type) {
    switch (type) {
      case 'FUNCTION':
      case 'METHOD':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CLASS':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'API_ENDPOINT':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'DATABASE_OPERATION':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'AUTHENTICATION_INDICATOR':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'VALIDATION_INDICATOR':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'TEST_REFERENCE':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-navy-700" />
        <p className="text-xs text-slate-500 font-medium">Loading code submission data...</p>
      </div>
    );
  }

  const detectedLanguages = activeSubmission?.languages || {};
  const evidenceByType = activeSubmission?.analysis_summary?.evidenceByType || {};

  const filteredFiles = filesList.filter((f) => {
    if (!fileSearch) return true;
    return f.file_path.toLowerCase().includes(fileSearch.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Approved Requirements Link */}
      <div className="flex justify-end">
        <Link href={`/projects/${projectId}/requirements`}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved Requirements ({approvedReqCount})
          </Button>
        </Link>
      </div>

      {/* Phase Stepper Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Phase 3: Developer Code Submission & Static Analysis
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Project: <span className="font-semibold text-slate-700">{project?.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Zero Execution Environment
            </span>
          </div>
        </div>

        <Stepper currentStep={3} projectId={projectId} />
      </div>

      {/* Requirement Context Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-md text-blue-700 shrink-0 mt-0.5">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
              Traceability Prerequisite Check
            </h2>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              Found <strong className="font-semibold">{approvedReqCount} approved requirements</strong> from Phase 2.
              Source code evidence collected here will ground requirement verification in Phase 4.
            </p>
          </div>
        </div>
        <Link href={`/projects/${projectId}/requirements`}>
          <Button variant="outline" size="sm" className="bg-white hover:bg-blue-50 text-blue-800 text-xs shrink-0">
            View Requirements
          </Button>
        </Link>
      </div>

      {uploadError && (
        <Alert variant="error" title="Submission Error">
          {uploadError}
        </Alert>
      )}

      {/* Active Submission Card (if one exists) */}
      {activeSubmission && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-navy-50 rounded-lg text-navy-800 shrink-0 border border-navy-100">
                <FileCode className="w-5 h-5 text-navy-800" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{activeSubmission.filename}</h3>
                  <Badge variant="success" className="text-[10px] px-2 py-0.5 font-semibold">
                    v{activeSubmission.version} (Active)
                  </Badge>
                  <Badge
                    variant={
                      activeSubmission.status === 'ANALYZED'
                        ? 'success'
                        : activeSubmission.status === 'FAILED'
                        ? 'error'
                        : 'warning'
                    }
                    className="text-[10px] px-2 py-0.5"
                  >
                    {activeSubmission.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                  <span>Size: {(activeSubmission.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>•</span>
                  <span>Submitted: {new Date(activeSubmission.created_at).toLocaleString()}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    SHA: {activeSubmission.archive_hash?.slice(0, 12)}...
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReanalyze}
                disabled={isReanalyzing || isUploading}
                className="gap-1.5 text-xs text-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin text-navy-600' : ''}`} />
                {isReanalyzing ? 'Re-analyzing...' : 'Re-analyze Archive'}
              </Button>
            </div>
          </div>

          {/* Metric Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100 border-b border-slate-100">
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Analyzed Files</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {activeSubmission.analyzed_files}
                <span className="text-xs font-normal text-slate-400 ml-1.5">
                  / {activeSubmission.total_files} discovered
                </span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lines of Code</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {activeSubmission.total_lines?.toLocaleString() || 0}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Collected Evidence</p>
              <p className="text-xl font-bold text-navy-800 mt-1">
                {activeSubmission.evidence_count}
                <span className="text-xs font-normal text-slate-400 ml-1.5">records</span>
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Excluded / Skipped</p>
              <p className="text-xl font-bold text-slate-600 mt-1">
                {activeSubmission.skipped_files}
                <span className="text-xs font-normal text-slate-400 ml-1.5">assets/dirs</span>
              </p>
            </div>
          </div>

          {/* Languages & Evidence Breakdown */}
          <div className="p-4 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-600 mr-1">Languages:</span>
              {Object.keys(detectedLanguages).length === 0 ? (
                <span className="text-slate-400">None detected</span>
              ) : (
                Object.entries(detectedLanguages).map(([lang, count]) => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium text-[11px]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-navy-600"></span>
                    {lang}: <strong className="font-semibold">{count}</strong>
                  </span>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-600 mr-1">Evidence Breakdown:</span>
              {Object.entries(evidenceByType).slice(0, 4).map(([type, count]) => (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${getEvidenceBadgeColor(
                    type
                  )}`}
                >
                  {type}: {count}
                </span>
              ))}
              {Object.keys(evidenceByType).length > 4 && (
                <span className="text-slate-400 text-[11px]">
                  +{Object.keys(evidenceByType).length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ZIP Upload Card (Always accessible for new submissions / versions) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Upload Developer Source Code Archive (ZIP)</CardTitle>
              <CardDescription className="text-xs">
                Upload a ZIP containing implementation source code. Archives are extracted inside an isolated sandbox with zero code execution.
              </CardDescription>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                Max Size: 50 MB
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver
                ? 'border-navy-600 bg-navy-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-3 bg-white rounded-full shadow-xs border border-slate-200 text-navy-800">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-navy-700" />
                ) : (
                  <UploadCloud className="w-6 h-6 text-navy-700" />
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {isUploading ? 'Extracting & Analyzing Source Code...' : 'Drag and drop your developer source ZIP here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supported formats: <strong className="text-slate-700">.ZIP only</strong> (up to 50 MB compressed)
                </p>
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5 text-xs bg-navy-800 hover:bg-navy-900"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analyzing AST & Indexing Lines...
                    </>
                  ) : (
                    <>
                      <FileCode className="w-3.5 h-3.5" />
                      Select ZIP File
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGithubModal(true)}
                  className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
                >
                  <GitFork className="w-3.5 h-3.5 text-slate-500" />
                  <span>Import from GitHub repo</span>
                  <Badge variant="warning" size="sm">
                    Preview
                  </Badge>
                </Button>
              </div>

              {/* Security Safeguards Callout */}
              <div className="pt-3 border-t border-slate-200/60 w-full max-w-lg flex items-center justify-around text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  ZIP Slip Defense
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                  Decompression Bomb Guard
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  No npm install / eval
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State when no code submissions exist yet */}
      {!activeSubmission && !isUploading && (
        <div className="text-center py-10 px-4 bg-white border border-dashed border-slate-200 rounded-lg space-y-3">
          <Code2 className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-700">No Code Submissions Yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload your developer source-code ZIP archive above to begin static AST evidence collection.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Select ZIP Archive
          </Button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      {activeSubmission && (
        <div className="space-y-4">
          <div className="border-b border-slate-200 flex items-center justify-between">
            <div className="flex space-x-6 text-sm font-medium">
              <button
                onClick={() => setActiveTab('evidence')}
                className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'evidence'
                    ? 'border-navy-800 text-navy-900 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Code2 className="w-4 h-4" />
                Evidence Explorer
                <Badge variant="outline" className="text-[10px] ml-1">
                  {activeSubmission.evidence_count}
                </Badge>
              </button>

              <button
                onClick={() => setActiveTab('files')}
                className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'files'
                    ? 'border-navy-800 text-navy-900 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <FolderTree className="w-4 h-4" />
                Source Files
                <Badge variant="outline" className="text-[10px] ml-1">
                  {activeSubmission.analyzed_files}
                </Badge>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'history'
                    ? 'border-navy-800 text-navy-900 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Clock className="w-4 h-4" />
                Submission Versions
                <Badge variant="outline" className="text-[10px] ml-1">
                  {submissions.length}
                </Badge>
              </button>
            </div>
          </div>

          {/* TAB 1: EVIDENCE EXPLORER */}
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              {/* Filter & Search Bar */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filter:</span>
                  </div>

                  {/* Evidence Type Filter */}
                  <select
                    value={evidenceTypeFilter}
                    onChange={(e) => setEvidenceTypeFilter(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
                  >
                    {EVIDENCE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === 'ALL' ? 'All Evidence Types' : t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>

                  {/* Language Filter */}
                  <select
                    value={evidenceLangFilter}
                    onChange={(e) => setEvidenceLangFilter(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
                  >
                    <option value="ALL">All Languages</option>
                    {Object.keys(detectedLanguages).map((lang) => (
                      <option key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={evidenceSearch}
                    onChange={(e) => setEvidenceSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchEvidence(1);
                    }}
                    placeholder="Search symbol, path..."
                    className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-navy-600"
                  />
                </div>
              </div>

              {/* Evidence Listing */}
              {evidenceLoading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin text-navy-700 mb-2" />
                  <p className="text-xs text-slate-500">Loading code evidence records...</p>
                </div>
              ) : evidenceList.length === 0 ? (
                <div className="p-12 text-center bg-white border border-slate-200 rounded-lg">
                  <Code2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No Evidence Found</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No code evidence records matched your current filters. Try resetting the filter criteria.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {evidenceList.map((ev) => (
                    <div
                      key={ev.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs hover:border-slate-300 transition-all space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border uppercase ${getEvidenceBadgeColor(
                              ev.evidence_type
                            )}`}
                          >
                            {ev.evidence_type.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-900">{ev.identifier}</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {ev.file_path}:L{ev.start_line}
                            {ev.end_line && ev.end_line !== ev.start_line ? `-L${ev.end_line}` : ''}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              ev.analysis_method === 'AST'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {ev.analysis_method}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500">
                            Conf: {ev.confidence}
                          </span>
                        </div>
                      </div>

                      {ev.context_summary && (
                        <p className="text-xs text-slate-600 leading-normal">{ev.context_summary}</p>
                      )}

                      {/* Monospace Code Excerpt */}
                      {ev.code_snippet && (
                        <div className="mt-2 bg-slate-900 text-slate-100 rounded-md p-3 overflow-x-auto font-mono text-xs border border-slate-800 leading-relaxed">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 pb-1 border-b border-slate-800">
                            <span>Source Excerpt (Lines {ev.start_line} - {ev.end_line})</span>
                            <span className="uppercase text-[9px] tracking-wider text-slate-400">{ev.language}</span>
                          </div>
                          <pre className="text-slate-200 whitespace-pre-wrap">{ev.code_snippet}</pre>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {evidencePagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 px-1 text-xs text-slate-600">
                      <span>
                        Showing {evidenceList.length} of {evidencePagination.total} evidence records
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={evidencePagination.page <= 1}
                          onClick={() => fetchEvidence(evidencePagination.page - 1)}
                          className="h-8 text-xs"
                        >
                          Previous
                        </Button>
                        <span className="text-xs font-semibold px-2">
                          Page {evidencePagination.page} of {evidencePagination.totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={evidencePagination.page >= evidencePagination.totalPages}
                          onClick={() => fetchEvidence(evidencePagination.page + 1)}
                          className="h-8 text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SOURCE FILES EXPLORER */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Filter Language:</span>
                  <select
                    value={fileLangFilter}
                    onChange={(e) => setFileLangFilter(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
                  >
                    <option value="ALL">All Languages</option>
                    {Object.keys(detectedLanguages).map((lang) => (
                      <option key={lang} value={lang}>
                        {lang.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    placeholder="Search file path..."
                    className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-navy-600"
                  />
                </div>
              </div>

              {filesLoading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin text-navy-700 mb-2" />
                  <p className="text-xs text-slate-500">Loading cataloged source files...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-12 text-center bg-white border border-slate-200 rounded-lg">
                  <FolderTree className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No Files Found</p>
                  <p className="text-xs text-slate-500 mt-1">No source files match the selected filter.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-4">File Path</th>
                        <th className="py-2.5 px-4">Language</th>
                        <th className="py-2.5 px-4 text-right">Size</th>
                        <th className="py-2.5 px-4 text-right">Lines</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredFiles.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-slate-800 font-medium">{f.file_path}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              {f.language}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-500">
                            {(f.file_size / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-slate-700">{f.line_count}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUBMISSION VERSION HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">Version</th>
                    <th className="py-2.5 px-4">Filename</th>
                    <th className="py-2.5 px-4">Submitted At</th>
                    <th className="py-2.5 px-4 text-right">Files</th>
                    <th className="py-2.5 px-4 text-right">Evidence</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub) => (
                    <tr
                      key={sub.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        sub.is_active === 1 ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-800">
                        v{sub.version}
                        {sub.is_active === 1 && (
                          <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{sub.filename}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(sub.created_at).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{sub.analyzed_files}</td>
                      <td className="py-3 px-4 text-right font-bold text-navy-800">{sub.evidence_count}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={sub.status === 'ANALYZED' ? 'success' : sub.status === 'FAILED' ? 'error' : 'warning'}
                          className="text-[10px]"
                        >
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {sub.is_active === 1 ? (
                          <span className="text-[11px] font-semibold text-slate-400">Current Active</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateSubmission(sub.id)}
                            className="h-7 text-[11px]"
                          >
                            Set as Active
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Import from GitHub repo Preview Modal */}
      <PreviewModal
        isOpen={showGithubModal}
        onClose={() => setShowGithubModal(false)}
        title="Import from GitHub repo"
        subtitle="Preview feature, coming in a future release"
        description="Connect public or private GitHub and GitLab repositories directly for automated source code ingestion and AST evidence collection."
        bullets={[
          'Clone and analyze source code directly from private or public GitHub/GitLab repositories.',
          'Automatic branch tracking and commit SHA association for continuous requirement auditing.',
          'Automated PR verification checks against client SRS specifications.',
          'Bounded safe ingestion inside our isolated sandbox with zero runtime code execution.',
        ]}
      />
    </div>
  );
}
