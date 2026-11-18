'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { Modal } from '@/components/ui/Modal.js';
import { PreviewModal } from '@/components/ui/PreviewModal.js';
import { showToast } from '@/components/ui/Toast.js';
import { Input } from '@/components/ui/Input.js';
import { Textarea } from '@/components/ui/Textarea.js';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Search,
  Filter,
  FileCode,
  Layers,
  FileCheck2,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Code2,
  Calendar,
  Clock,
  ArrowRight,
  Loader2,
  Info,
  Download,
  FileText,
  History,
  UserCheck,
  RotateCcw,
  GitCompare,
  AlertCircle,
} from 'lucide-react';

export default function TraceabilityMatrixPage({ params }) {
  const { id: projectId } = params;
  const router = useRouter();

  const [matrixData, setMatrixData] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Human Override State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('VERIFIED');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Override History Drawer / Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [overrideHistory, setOverrideHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Run Comparison State
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareBaseRunId, setCompareBaseRunId] = useState('');
  const [compareHeadRunId, setCompareHeadRunId] = useState('');
  const [comparisonData, setComparisonData] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compareFilter, setCompareFilter] = useState('ALL');

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedReviewer = localStorage.getItem('genesis_reviewer_name');
      if (savedReviewer) setReviewerName(savedReviewer);
    }
  }, []);

  // Inspector Modal
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    fetchMatrix();
    checkActiveJob();
  }, [projectId, selectedRunId]);

  async function checkActiveJob() {
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs/active`);
      const json = await res.json();
      if (json.success && json.data) {
        attachToJob(json.data.id);
      }
    } catch (err) {
      console.warn('Could not check active job:', err);
    }
  }

  function attachToJob(jobId) {
    setIsVerifying(true);
    setActiveJob((prev) => prev || { id: jobId, status: 'RUNNING', progressDone: 0, progressTotal: 1, currentLabel: 'Connecting...' });

    let eventSource = null;
    let pollInterval = null;

    try {
      eventSource = new EventSource(`/api/projects/${projectId}/jobs/${jobId}/events`);

      eventSource.addEventListener('progress', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.job) setActiveJob(data.job);
        } catch {}
      });

      eventSource.addEventListener('poll', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.job) setActiveJob(data.job);
        } catch {}
      });

      eventSource.addEventListener('succeeded', async (e) => {
        cleanup();
        setActiveJob(null);
        setIsVerifying(false);
        setIsUpgrading(false);
        await fetchMatrix();
      });

      eventSource.addEventListener('failed', async (e) => {
        cleanup();
        setActiveJob(null);
        setIsVerifying(false);
        setIsUpgrading(false);
        try {
          const data = JSON.parse(e.data);
          setErrorMsg(data.error || 'Verification job failed.');
        } catch {
          setErrorMsg('Verification job failed.');
        }
        await fetchMatrix();
      });

      eventSource.addEventListener('cancelled', async (e) => {
        cleanup();
        setActiveJob(null);
        setIsVerifying(false);
        setIsUpgrading(false);
        setErrorMsg('Verification run cancelled by user.');
        await fetchMatrix();
      });

      eventSource.onerror = () => {
        // Fallback polling if SSE disconnects
        if (!pollInterval) {
          pollInterval = setInterval(async () => {
            try {
              const res = await fetch(`/api/projects/${projectId}/jobs/${jobId}`);
              const json = await res.json();
              if (json.success && json.data) {
                setActiveJob(json.data);
                if (
                  json.data.status === 'SUCCEEDED' ||
                  json.data.status === 'FAILED' ||
                  json.data.status === 'CANCELLED'
                ) {
                  cleanup();
                  setActiveJob(null);
                  setIsVerifying(false);
                  setIsUpgrading(false);
                  await fetchMatrix();
                }
              }
            } catch {}
          }, 1000);
        }
      };
    } catch {
      // SSE not supported or blocked, fallback to polling
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/jobs/${jobId}`);
          const json = await res.json();
          if (json.success && json.data) {
            setActiveJob(json.data);
            if (
              json.data.status === 'SUCCEEDED' ||
              json.data.status === 'FAILED' ||
              json.data.status === 'CANCELLED'
            ) {
              clearInterval(pollInterval);
              setActiveJob(null);
              setIsVerifying(false);
              setIsUpgrading(false);
              await fetchMatrix();
            }
          }
        } catch {}
      }, 1000);
    }

    function cleanup() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
  }

  async function handleCancelJob() {
    if (!activeJob) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs/${activeJob.id}/cancel`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to cancel job.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleUpgradeRun() {
    const runId = selectedRunId || matrixData?.activeRun?.id;
    if (!runId) return;

    setIsUpgrading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/verification/${runId}/upgrade`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Upgrade request failed.');
      }

      if (res.status === 202 && json.data?.jobId) {
        attachToJob(json.data.jobId);
      } else {
        await fetchMatrix();
        setIsUpgrading(false);
      }
    } catch (err) {
      setErrorMsg(err.message);
      setIsUpgrading(false);
    }
  }

  async function fetchMatrix() {
    setIsLoading(true);
    try {
      const url = selectedRunId
        ? `/api/projects/${projectId}/matrix?runId=${selectedRunId}`
        : `/api/projects/${projectId}/matrix`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setMatrixData(json.data);
      } else {
        setErrorMsg(json.error || 'Failed to load traceability matrix');
      }
    } catch (err) {
      console.error('Error fetching matrix:', err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartVerification() {
    setIsVerifying(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/verification`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Verification execution failed.');
      }
      if (res.status === 202 && json.data?.jobId) {
        showToast('Verification audit started in background', 'success');
        attachToJob(json.data.jobId);
      } else {
        showToast('Verification audit completed successfully', 'success');
        await fetchMatrix();
        setIsVerifying(false);
      }
    } catch (err) {
      setErrorMsg(err.message);
      showToast(err.message || 'Verification execution failed', 'error');
      setIsVerifying(false);
    }
  }

  async function handleRetryUnverified() {
    if (!matrixData?.activeRun?.id) return;
    setIsRetrying(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/verification/${matrixData.activeRun.id}/retry`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Retry failed.');
      }
      await fetchMatrix();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleGenerateReport() {
    const runId = selectedRunId || matrixData?.activeRun?.id;
    if (!runId) return;

    setIsGeneratingReport(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/verification/${runId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate PDF report.');
      }
      setGeneratedReport(json.data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            VERIFIED
          </span>
        );
      case 'PARTIALLY_IMPLEMENTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <AlertTriangle className="w-3 h-3 text-blue-600" />
            PARTIALLY IMPLEMENTED
          </span>
        );
      case 'NOT_IMPLEMENTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            NOT IMPLEMENTED
          </span>
        );
      case 'UNVERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <HelpCircle className="w-3 h-3 text-slate-500" />
            UNVERIFIED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            AWAITING RUN
          </span>
        );
    }
  }

  function handleOpenReview(row) {
    if (!row.verification) return;
    setReviewTarget(row);
    const currentEff = row.verification.effectiveStatus || row.verification.effective_status || row.verification.status;
    const nextStatus = currentEff === 'VERIFIED' ? 'PARTIALLY_IMPLEMENTED' : 'VERIFIED';
    setReviewStatus(nextStatus);
    setReviewReason('');
    setReviewError('');
    setShowReviewModal(true);
  }

  async function handleSubmitReview() {
    if (!reviewTarget?.verification) return;
    const reviewer = reviewerName.trim();
    if (reviewer.length < 2 || reviewer.length > 60) {
      setReviewError('Reviewer name must be between 2 and 60 characters.');
      return;
    }
    const reason = reviewReason.trim();
    if (reason.length < 20 || reason.length > 1000) {
      setReviewError(`Justification must be between 20 and 1000 characters (currently ${reason.length}).`);
      return;
    }

    setIsSubmittingReview(true);
    setReviewError('');
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('genesis_reviewer_name', reviewer);
      }

      const runId = selectedRunId || matrixData?.activeRun?.id;
      const resultId = reviewTarget.verification.id;
      const res = await fetch(`/api/projects/${projectId}/verification/${runId}/results/${resultId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_status: reviewStatus,
          reason,
          reviewer_name: reviewer,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit override');
      }

      setShowReviewModal(false);
      setReviewTarget(null);
      await fetchMatrix();
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function handleOpenHistory(row) {
    if (!row.verification) return;
    setHistoryTarget(row);
    setRevokingId(null);
    setRevokeReason('');
    setIsLoadingHistory(true);
    setShowHistoryModal(true);
    try {
      const runId = selectedRunId || matrixData?.activeRun?.id;
      const resultId = row.verification.id;
      const res = await fetch(`/api/projects/${projectId}/verification/${runId}/results/${resultId}/overrides`);
      const data = await res.json();
      if (data.success) {
        setOverrideHistory(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load override history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleRevokeOverride(overrideId) {
    if (!historyTarget?.verification) return;
    const reviewer = reviewerName.trim();
    if (reviewer.length < 2 || reviewer.length > 60) {
      alert('Reviewer name is required to revoke an override (2-60 characters).');
      return;
    }
    const reason = revokeReason.trim();
    if (reason.length < 5 || reason.length > 1000) {
      alert('Revoke reason is required (5-1000 characters).');
      return;
    }

    setIsRevoking(true);
    try {
      const runId = selectedRunId || matrixData?.activeRun?.id;
      const resultId = historyTarget.verification.id;
      const res = await fetch(`/api/projects/${projectId}/verification/${runId}/results/${resultId}/override/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer_name: reviewer,
          revoke_reason: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke override');
      }

      setRevokingId(null);
      setRevokeReason('');
      // Refresh history
      const histRes = await fetch(`/api/projects/${projectId}/verification/${runId}/results/${resultId}/overrides`);
      const histData = await histRes.json();
      if (histData.success) {
        setOverrideHistory(histData.data || []);
      }
      await fetchMatrix();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsRevoking(false);
    }
  }

  async function handleRunComparison() {
    if (!compareBaseRunId || !compareHeadRunId) {
      setCompareError('Please select both a base run and a head run.');
      return;
    }
    if (compareBaseRunId === compareHeadRunId) {
      setCompareError('Base and head runs must be different.');
      return;
    }

    setIsComparing(true);
    setCompareError('');
    try {
      const res = await fetch(
        `/api/projects/${projectId}/verification/compare?base=${compareBaseRunId}&head=${compareHeadRunId}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Comparison failed');
      }
      setComparisonData(data.data);
    } catch (err) {
      setCompareError(err.message);
    } finally {
      setIsComparing(false);
    }
  }

  function getCriteriaBadge(assessment) {
    switch (assessment) {
      case 'SUPPORTED':
        return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">SUPPORTED</span>;
      case 'PARTIALLY_SUPPORTED':
        return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800">PARTIAL</span>;
      case 'NOT_SUPPORTED':
        return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">NOT SUPPORTED</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">INCONCLUSIVE</span>;
    }
  }

  if (isLoading && !matrixData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-navy-700" />
        <p className="text-xs text-slate-500 font-medium">Loading traceability matrix data...</p>
      </div>
    );
  }

  const { project, summary, eligibility, activeRun, availableRuns, matrix } = matrixData || {
    summary: {},
    eligibility: {},
    matrix: [],
    availableRuns: [],
  };

  // Filter rows
  const filteredRows = (matrix || []).filter((row) => {
    const vr = row.verification;
    const isOverridden = Boolean(vr?.isOverridden || vr?.is_overridden);
    const effStatus = vr?.effectiveStatus || vr?.effective_status || vr?.status || 'PENDING_VERIFICATION';
    const vrMethod = vr?.method || 'AI';

    if (statusFilter === 'OVERRIDDEN') {
      if (!isOverridden) return false;
    } else if (statusFilter !== 'ALL' && effStatus !== statusFilter) {
      return false;
    }

    if (methodFilter !== 'ALL' && vrMethod !== methodFilter) return false;
    if (categoryFilter !== 'ALL' && row.category !== categoryFilter) return false;
    if (priorityFilter !== 'ALL' && row.priority !== priorityFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const codeMatch = row.reqCode.toLowerCase().includes(term);
      const titleMatch = row.title.toLowerCase().includes(term);
      const descMatch = row.description.toLowerCase().includes(term);
      const explMatch = (row.verification?.explanation || '').toLowerCase().includes(term);
      if (!codeMatch && !titleMatch && !descMatch && !explMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stepper Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Phase 4: Requirement Traceability Matrix & Advance Genesis Model Verification
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Project: <span className="font-semibold text-slate-700">{project?.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Evidence-Grounded Interpretation
            </span>
          </div>
        </div>

        <Stepper currentStep={4} projectId={projectId} />
      </div>

      {/* Live Background Job Progress Stream */}
      {activeJob && (
        <Card className="border-indigo-300 bg-indigo-50/40 shadow-xs">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
                <span className="text-sm font-bold text-indigo-950">
                  {activeJob.type === 'VERIFICATION_UPGRADE'
                    ? (activeJob.status === 'QUEUED' ? 'Verification Upgrade Queued...' : 'Upgrading Verification Run...')
                    : (activeJob.status === 'QUEUED' ? 'Evidence-Grounded Verification Queued...' : 'Evidence-Grounded Verification in Progress...')}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {activeJob.status}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isCancelling || activeJob.cancelRequested}
                onClick={handleCancelJob}
                className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50 h-7 self-start sm:self-auto font-medium"
              >
                {isCancelling ? 'Cancelling...' : activeJob.cancelRequested ? 'Cancelling...' : 'Cancel Run'}
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate font-medium">{activeJob.currentLabel || 'Processing requirements...'}</span>
                <span className="font-bold text-slate-800">
                  {activeJob.progressTotal > 0
                    ? `${Math.round((activeJob.progressDone / activeJob.progressTotal) * 100)}% (${activeJob.progressDone}/${activeJob.progressTotal})`
                    : 'Initializing...'}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${
                      activeJob.progressTotal > 0
                        ? Math.min(100, Math.round((activeJob.progressDone / activeJob.progressTotal) * 100))
                        : 5
                    }%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Eligibility Warning (if blocked) */}
      {!eligibility?.isEligible && (
        <Alert variant="warning" title="Verification Blocked">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <p className="text-xs">{eligibility?.reason}</p>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/projects/${projectId}/requirements`}>
                <Button size="sm" variant="outline" className="text-xs">
                  Review Requirements
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/code`}>
                <Button size="sm" variant="primary" className="text-xs bg-navy-800">
                  Upload Code Archive
                </Button>
              </Link>
            </div>
          </div>
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="error" title="Audit Notice">
          {errorMsg}
        </Alert>
      )}

      {generatedReport && (
        <Alert variant="success" title="Audit PDF Report Ready">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <span className="text-xs">
              Report <strong>{generatedReport.reportName}</strong> generated successfully.
            </span>
            <div className="flex items-center gap-2">
              <a href={generatedReport.downloadUrl} download>
                <Button size="sm" variant="primary" className="gap-1.5 text-xs bg-navy-800">
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </Button>
              </a>
              <Link href={`/projects/${projectId}/report`}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" />
                  View All Reports
                </Button>
              </Link>
            </div>
          </div>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Approved Reqs</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{summary.totalApproved || 0}</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/20">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Verified</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">
              {summary.effectiveCounts?.verified ?? summary.verified ?? 0}
            </p>
            {summary.overriddenCount > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">Orig: {summary.verified || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/20">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Partial</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">
              {summary.effectiveCounts?.partiallyImplemented ?? summary.partiallyImplemented ?? 0}
            </p>
            {summary.overriddenCount > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">Orig: {summary.partiallyImplemented || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-rose-200 bg-rose-50/20">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Not Implemented</p>
            <p className="text-2xl font-bold text-rose-800 mt-1">
              {summary.effectiveCounts?.notImplemented ?? summary.notImplemented ?? 0}
            </p>
            {summary.overriddenCount > 0 && (
              <p className="text-[10px] text-slate-500 mt-0.5">Orig: {summary.notImplemented || 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-50/50">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Unverified</p>
            <p className="text-2xl font-bold text-slate-700 mt-1">
              {summary.effectiveCounts?.unverified ?? summary.unverified ?? 0}
            </p>
            {summary.overriddenCount > 0 && (
              <p className="text-[10px] text-purple-700 font-semibold mt-0.5">{summary.overriddenCount} Overridden</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-indigo-200 bg-indigo-50/20">
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Method Ratio</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xs font-bold text-indigo-900">Advance Genesis Model: {summary.aiCount || 0}</span>
              <span className="text-slate-400">/</span>
              <span className="text-xs font-bold text-amber-800">Base Genesis Model: {summary.rulesCount || 0}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Mode: {summary.aiMode || 'LIVE'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Run Action Banner & Version Switcher */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Verification Run:</span>
            {availableRuns?.length > 0 ? (
              <select
                value={selectedRunId || activeRun?.id || ''}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-1 focus:ring-navy-600 font-medium"
              >
                {availableRuns.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    Run {availableRuns.length - i} — {new Date(r.started_at).toLocaleString()} ({r.status})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-400 italic">No verification runs yet</span>
            )}
          </div>

          {activeRun && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>•</span>
              <span>Code: <strong className="text-slate-700">{activeRun.submission_filename || 'Active Archive'}</strong></span>
              <span>•</span>
              <span>Model: <strong className="text-slate-700">{activeRun.model_name}</strong></span>
              {activeRun.base_run_id && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    Upgraded from Run #{activeRun.base_run_id.slice(-6)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {availableRuns?.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCompareBaseRunId(availableRuns[1]?.id || availableRuns[0]?.id || '');
                setCompareHeadRunId(availableRuns[0]?.id || '');
                setComparisonData(null);
                setCompareError('');
                setShowCompareModal(true);
              }}
              className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
            >
              <GitCompare className="w-3.5 h-3.5 text-slate-600" />
              Compare Runs
            </Button>
          )}

          {activeRun &&
            activeRun.status === 'COMPLETED' &&
            (summary.rulesCount > 0 || activeRun.rules_count > 0) && (
              <Button
                variant="outline"
                size="sm"
                disabled={isUpgrading || isVerifying || isRetrying}
                onClick={handleUpgradeRun}
                className="gap-1.5 text-xs text-indigo-800 border-indigo-300 hover:bg-indigo-50 font-semibold"
                title="Re-evaluate degraded requirements with Advance Genesis Model while preserving verified results"
              >
                {isUpgrading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Upgrade with Advance Model ({summary.rulesCount || activeRun.rules_count})
                  </>
                )}
              </Button>
            )}

          {summary.unverified > 0 && activeRun && (
            <Button
              variant="outline"
              size="sm"
              disabled={isRetrying || isVerifying}
              onClick={handleRetryUnverified}
              className="gap-1.5 text-xs text-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin text-navy-600' : ''}`} />
              {isRetrying ? 'Retrying...' : `Retry Unverified (${summary.unverified})`}
            </Button>
          )}

          {activeRun && activeRun.status === 'COMPLETED' && (
            <Button
              variant="outline"
              size="sm"
              disabled={isGeneratingReport || isVerifying || isRetrying}
              onClick={handleGenerateReport}
              className="gap-1.5 text-xs text-navy-800 border-navy-300 hover:bg-navy-50"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileCheck2 className="w-3.5 h-3.5 text-navy-700" />
                  Generate PDF Report
                </>
              )}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export to CSV / Jira</span>
            <Badge variant="warning" size="sm">
              Preview
            </Badge>
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={!eligibility?.isEligible || isVerifying || isRetrying}
            onClick={handleStartVerification}
            className="gap-1.5 text-xs bg-navy-800 hover:bg-navy-900"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {activeJob?.status === 'QUEUED'
                  ? 'Verification Queued...'
                  : summary?.aiMode === 'RULES_ONLY'
                  ? 'Auditing with Base Genesis Model...'
                  : 'Auditing with Advance Genesis Model...'}
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                {activeRun ? 'Re-run Verification Audit' : 'Execute Verification Run'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600 font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="OVERRIDDEN">Overridden Only ({summary.overriddenCount || 0})</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="PARTIALLY_IMPLEMENTED">PARTIALLY IMPLEMENTED</option>
            <option value="NOT_IMPLEMENTED">NOT IMPLEMENTED</option>
            <option value="UNVERIFIED">UNVERIFIED</option>
            <option value="PENDING_VERIFICATION">AWAITING RUN</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
          >
            <option value="ALL">All Methods</option>
            <option value="AI">Advance Genesis Model</option>
            <option value="RULES">Base Genesis Model</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
          >
            <option value="ALL">All Categories</option>
            <option value="FUNCTIONAL">Functional</option>
            <option value="SECURITY">Security</option>
            <option value="NON_FUNCTIONAL">Non-Functional</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="OTHER">Other</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search code, title, explanation..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-navy-600"
          />
        </div>
      </div>

      {/* Base Genesis Model Evaluation Notice */}
      {(summary.rulesCount > 0 || (activeRun && activeRun.rules_count > 0)) && (
        <Alert variant="warning">
          {(summary.rulesCount || activeRun?.rules_count)} of {activeRun?.total_requirements || summary.totalApproved || matrix?.length || 0} requirements were evaluated by Base Genesis Model because the Advance Genesis Model was at capacity. Use &quot;Upgrade with Advance Model&quot; once it is available to re-verify them.
        </Alert>
      )}

      {/* Traceability Matrix Table */}
      {filteredRows.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-lg space-y-3">
          <Layers className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-700">
              {matrix.length === 0
                ? 'No Approved Requirements Available'
                : 'No Requirements Match Current Filter'}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {matrix.length === 0
                ? 'Before verifying, review and approve requirements extracted from your SRS document in Phase 2.'
                : 'Try resetting the status, category, or search filters to see all requirements.'}
            </p>
          </div>
          {matrix.length === 0 ? (
            <div className="pt-1">
              <Link href={`/projects/${projectId}/requirements`}>
                <Button size="sm" variant="primary">
                  Review & Approve Requirements
                </Button>
              </Link>
            </div>
          ) : (
            <div className="pt-1">
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setStatusFilter('ALL');
                  setMethodFilter('ALL');
                  setCategoryFilter('ALL');
                  setPriorityFilter('ALL');
                  setSearchTerm('');
                }}
              >
                Reset Filters
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-28">Req Code</th>
                <th className="py-3 px-4">Title & Description</th>
                <th className="py-3 px-4 w-28">Category</th>
                <th className="py-3 px-4 w-24">Priority</th>
                <th className="py-3 px-4 w-44">Verification Status</th>
                <th className="py-3 px-4 w-24 text-center">Confidence</th>
                <th className="py-3 px-4 w-24 text-center">Evidence</th>
                <th className="py-3 px-4 w-40 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => {
                const vr = row.verification;
                const isOverridden = Boolean(vr?.isOverridden || vr?.is_overridden);
                const effStatus = vr?.effectiveStatus || vr?.effective_status || vr?.status;
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{row.reqCode}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 line-clamp-1">{row.title}</p>
                      <p className="text-slate-500 text-[11px] line-clamp-1 mt-0.5">{row.description}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {row.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-medium text-slate-700">{row.priority}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div>{getStatusBadge(effStatus)}</div>
                        {vr && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span
                              title={vr.fallbackReason ? `Fallback: ${vr.fallbackReason}` : (vr.method === 'RULES' ? 'Evaluated using Base Genesis Model' : (vr.model ? `Evaluated using ${vr.model}` : 'Evaluated using Advance Genesis Model'))}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border cursor-help ${
                                vr.method === 'RULES'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {vr.method === 'RULES' ? 'Base Genesis Model' : 'Advance Genesis Model'}
                            </span>
                            {vr.carriedOverFrom && (
                              <span
                                title={`Carried over from run ${vr.carriedOverFrom}`}
                                className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                              >
                                Carried
                              </span>
                            )}
                            {isOverridden && (
                              <span
                                title={`Overridden from ${vr.status} to ${effStatus} by ${vr.override?.reviewer_name || 'auditor'}: "${vr.override?.reason}"`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 cursor-help"
                              >
                                <UserCheck className="w-2.5 h-2.5 text-purple-700" />
                                {vr.status} → {effStatus}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[11px] font-semibold text-slate-700">
                      {vr ? `${Math.round(vr.confidenceScore * 100)}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-navy-800">
                        <Code2 className="w-3.5 h-3.5 text-navy-600" />
                        {vr ? vr.evidenceCount : 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {vr && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenReview(row)}
                            className="h-7 text-[11px] gap-1 text-slate-700 hover:text-navy-900 border-slate-300"
                            title="Review or override verification status"
                          >
                            <UserCheck className="w-3 h-3 text-purple-600" />
                            Review
                          </Button>
                        )}
                        {vr && isOverridden && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenHistory(row)}
                            className="h-7 text-[11px] gap-1 text-purple-800 border-purple-300 hover:bg-purple-50"
                            title="View override audit log and history"
                          >
                            <History className="w-3 h-3 text-purple-600" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRow(row)}
                          className="h-7 text-[11px] gap-1"
                        >
                          Inspect
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Requirement & Evidence Inspector Modal */}
      {selectedRow && (
        <Modal
          isOpen={!!selectedRow}
          onClose={() => setSelectedRow(null)}
          title={`Traceability Audit: ${selectedRow.reqCode}`}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-5 text-xs max-h-[75vh] overflow-y-auto pr-1">
            {/* Header / Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-900">{selectedRow.reqCode}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-800 uppercase">
                  {selectedRow.category}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Priority: {selectedRow.priority}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedRow.verification && (
                  <>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        selectedRow.verification.method === 'RULES'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      Method: {selectedRow.verification.method === 'RULES' ? 'Base Genesis Model' : 'Advance Genesis Model'}
                      {selectedRow.verification.fallbackReason && ` (${selectedRow.verification.fallbackReason})`}
                    </span>
                    {selectedRow.verification.carriedOverFrom && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        Carried Over from Base Run
                      </span>
                    )}
                  </>
                )}
                <div>{getStatusBadge(selectedRow.verification?.status)}</div>
              </div>
            </div>

            {/* Title & Full Description */}
            <div>
              <h3 className="text-sm font-bold text-slate-900">{selectedRow.title}</h3>
              <p className="text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{selectedRow.description}</p>
            </div>

            {/* Acceptance Criteria */}
            {selectedRow.acceptanceCriteria?.length > 0 && (
              <div className="p-3.5 bg-blue-50/50 rounded-lg border border-blue-100 space-y-1.5">
                <p className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">
                  Testable Acceptance Criteria:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {selectedRow.acceptanceCriteria.map((c, i) => (
                    <li key={i} className="leading-normal">{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Grounded Explanation */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-navy-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-navy-700" />
                  Grounded Verification Explanation
                </p>
                {selectedRow.verification && (
                  <span className="text-[11px] font-semibold text-slate-600">
                    Confidence: {Math.round(selectedRow.verification.confidenceScore * 100)}% (
                    {selectedRow.verification.confidenceReason})
                  </span>
                )}
              </div>
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                {selectedRow.verification?.explanation || 'No verification run has been executed yet for this requirement.'}
              </p>
            </div>

            {/* Acceptance Criteria Specific Assessments */}
            {selectedRow.verification?.criteriaAssessment?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Criterion-by-Criterion Evaluation:
                </p>
                <div className="space-y-2">
                  {selectedRow.verification.criteriaAssessment.map((ca, idx) => (
                    <div key={idx} className="p-3 bg-white rounded border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 text-xs">{ca.criterion}</span>
                        {getCriteriaBadge(ca.assessment)}
                      </div>
                      <p className="text-slate-600 text-[11px]">{ca.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grounded Code Evidence List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Referenced Code Evidence ({selectedRow.verification?.evidenceReferences?.length || 0}):
                </p>
              </div>

              {selectedRow.verification?.evidenceReferences?.length === 0 ? (
                <p className="text-slate-400 italic text-[11px]">No supporting code evidence records established.</p>
              ) : (
                <div className="space-y-3">
                  {selectedRow.verification?.evidenceReferences?.map((ev) => (
                    <div key={ev.id} className="p-3 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-navy-50 text-navy-800 border border-navy-100 uppercase">
                            {ev.evidenceType}
                          </span>
                          <span className="font-mono font-bold text-slate-900">{ev.identifier}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {ev.filePath}:L{ev.startLine}
                            {ev.endLine && ev.endLine !== ev.startLine ? `-L${ev.endLine}` : ''}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            {ev.analysisMethod}
                          </span>
                        </div>
                      </div>

                      {ev.contextSummary && (
                        <p className="text-[11px] text-slate-600">{ev.contextSummary}</p>
                      )}

                      {/* Code Snippet Box */}
                      {ev.codeSnippet && (
                        <div className="bg-slate-900 text-slate-200 rounded p-2.5 font-mono text-[11px] overflow-x-auto border border-slate-800 leading-relaxed">
                          <pre className="whitespace-pre-wrap">{ev.codeSnippet}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Limitations & Caveats */}
            {selectedRow.verification?.limitations?.length > 0 && (
              <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 space-y-1">
                <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  Analysis Caveats & Limitations:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-950 text-[11px]">
                  {selectedRow.verification.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Review & Override Modal */}
      {showReviewModal && reviewTarget && (
        <Modal
          isOpen={showReviewModal}
          onClose={() => !isSubmittingReview && setShowReviewModal(false)}
          title={`Review Verification: ${reviewTarget.reqCode}`}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <p className="font-bold text-slate-900 text-sm">{reviewTarget.title}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <span>Original Status:</span>
                <strong>{reviewTarget.verification?.status}</strong>
                <span>•</span>
                <span>Current Effective:</span>
                <strong>{reviewTarget.verification?.effectiveStatus || reviewTarget.verification?.effective_status}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">New Effective Status</label>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-navy-600"
              >
                <option value="VERIFIED">VERIFIED</option>
                <option value="PARTIALLY_IMPLEMENTED">PARTIALLY IMPLEMENTED</option>
                <option value="NOT_IMPLEMENTED">NOT IMPLEMENTED</option>
                <option value="UNVERIFIED">UNVERIFIED</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">Reviewer Name (Auditor Identity)</label>
              <Input
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="e.g. Lead Compliance Auditor"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">Audit Justification Reason</label>
                <span className={`text-[10px] ${reviewReason.trim().length < 20 || reviewReason.trim().length > 1000 ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
                  {reviewReason.trim().length} / 1000 chars (min 20)
                </span>
              </div>
              <Textarea
                rows={4}
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder="State the technical and evidentiary justification for overriding this result (mandatory minimum 20 characters)..."
                className="text-xs leading-relaxed"
              />
            </div>

            {reviewError && (
              <Alert variant="error" title="Review Submission Error">
                <p className="text-xs">{reviewError}</p>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                disabled={isSubmittingReview}
                onClick={() => setShowReviewModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isSubmittingReview}
                onClick={handleSubmitReview}
                className="bg-navy-800 hover:bg-navy-900 gap-1.5"
              >
                {isSubmittingReview ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Recording Override...
                  </>
                ) : (
                  'Apply Override'
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Override History Modal */}
      {showHistoryModal && historyTarget && (
        <Modal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={`Override Audit Trail: ${historyTarget.reqCode}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 font-medium">{historyTarget.title}</p>
            {isLoadingHistory ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-navy-700" />
              </div>
            ) : overrideHistory.length === 0 ? (
              <p className="text-slate-400 italic">No override history recorded for this requirement.</p>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {overrideHistory.map((ovr) => {
                  const isRevoked = Boolean(ovr.revoked_at);
                  return (
                    <div
                      key={ovr.id}
                      className={`p-3.5 rounded-lg border space-y-2 ${
                        isRevoked ? 'bg-slate-50/70 border-slate-200 opacity-80' : 'bg-purple-50/40 border-purple-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{ovr.previous_status}</span>
                          <span className="text-slate-400">→</span>
                          <span className="font-bold text-purple-900">{ovr.new_status}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              isRevoked ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isRevoked ? 'Revoked' : 'Active Override'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(ovr.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-slate-700 leading-relaxed font-sans">{ovr.reason}</p>
                      <p className="text-[10px] text-slate-500">
                        Reviewer: <strong className="text-slate-700">{ovr.reviewer_name}</strong>
                      </p>

                      {isRevoked && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-900 space-y-0.5">
                          <p className="font-bold">Revocation Notice:</p>
                          <p>{ovr.revoke_reason}</p>
                          <p className="text-[10px] text-rose-700">
                            Revoked by {ovr.revoked_by} on {new Date(ovr.revoked_at).toLocaleString()}
                          </p>
                        </div>
                      )}

                      {!isRevoked && (
                        <div className="pt-2 border-t border-purple-100 flex items-center justify-end">
                          {revokingId === ovr.id ? (
                            <div className="w-full space-y-2 p-2 bg-white rounded border border-purple-200">
                              <label className="font-bold text-slate-700 text-[11px]">Revoke Reason</label>
                              <Input
                                value={revokeReason}
                                onChange={(e) => setRevokeReason(e.target.value)}
                                placeholder="State why this override is being revoked (min 5 chars)..."
                                className="text-xs"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isRevoking}
                                  onClick={() => setRevokingId(null)}
                                  className="h-7 text-[11px]"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={isRevoking}
                                  onClick={() => handleRevokeOverride(ovr.id)}
                                  className="h-7 text-[11px] bg-rose-700 hover:bg-rose-800"
                                >
                                  {isRevoking ? 'Revoking...' : 'Confirm Revoke'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRevokingId(ovr.id);
                                setRevokeReason('');
                              }}
                              className="h-6 text-[10px] text-rose-700 border-rose-200 hover:bg-rose-50"
                            >
                              Revoke Override
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Run Comparison Modal */}
      {showCompareModal && (
        <Modal
          isOpen={showCompareModal}
          onClose={() => setShowCompareModal(false)}
          title="Compare Traceability Verification Runs"
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Base Run:</span>
                <select
                  value={compareBaseRunId}
                  onChange={(e) => setCompareBaseRunId(e.target.value)}
                  className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded font-medium text-slate-800"
                >
                  {availableRuns.map((r, i) => (
                    <option key={r.id} value={r.id}>
                      Run {availableRuns.length - i} ({new Date(r.started_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Head Run:</span>
                <select
                  value={compareHeadRunId}
                  onChange={(e) => setCompareHeadRunId(e.target.value)}
                  className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded font-medium text-slate-800"
                >
                  {availableRuns.map((r, i) => (
                    <option key={r.id} value={r.id}>
                      Run {availableRuns.length - i} ({new Date(r.started_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="primary"
                size="sm"
                disabled={isComparing || compareBaseRunId === compareHeadRunId}
                onClick={handleRunComparison}
                className="bg-navy-800 hover:bg-navy-900 gap-1.5 h-8"
              >
                {isComparing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Comparing...
                  </>
                ) : (
                  'Run Comparison'
                )}
              </Button>
            </div>

            {compareError && (
              <Alert variant="error" title="Comparison Error">
                <p className="text-xs">{compareError}</p>
              </Alert>
            )}

            {comparisonData && (
              <div className="space-y-4">
                {/* Warnings */}
                {comparisonData.warnings?.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                    <p className="font-bold text-amber-900 text-[11px] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      Comparison Context Warnings:
                    </p>
                    <ul className="list-disc list-inside text-amber-950 text-[11px] space-y-0.5">
                      {comparisonData.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary Pills */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-rose-700 uppercase">Regressed</p>
                    <p className="text-xl font-bold text-rose-900 mt-0.5">{comparisonData.summary.REGRESSED}</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase">Improved</p>
                    <p className="text-xl font-bold text-emerald-900 mt-0.5">{comparisonData.summary.IMPROVED}</p>
                  </div>
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-purple-700 uppercase">Changed ?</p>
                    <p className="text-xl font-bold text-purple-900 mt-0.5">{comparisonData.summary.CHANGED_UNKNOWN}</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase">Unchanged</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{comparisonData.summary.UNCHANGED}</p>
                  </div>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-blue-700 uppercase">Added</p>
                    <p className="text-xl font-bold text-blue-900 mt-0.5">{comparisonData.summary.ADDED}</p>
                  </div>
                  <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase">Removed</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{comparisonData.summary.REMOVED}</p>
                  </div>
                </div>

                {/* Filter */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600 text-xs">Filter Changes:</span>
                    <select
                      value={compareFilter}
                      onChange={(e) => setCompareFilter(e.target.value)}
                      className="h-8 px-2.5 text-xs bg-white border border-slate-300 rounded font-medium text-slate-700"
                    >
                      <option value="ALL">All Changes</option>
                      <option value="REGRESSED">Regressed Only ({comparisonData.summary.REGRESSED})</option>
                      <option value="IMPROVED">Improved Only ({comparisonData.summary.IMPROVED})</option>
                      <option value="CHANGED_UNKNOWN">Changed Unknown ({comparisonData.summary.CHANGED_UNKNOWN})</option>
                      <option value="UNCHANGED">Unchanged ({comparisonData.summary.UNCHANGED})</option>
                    </select>
                  </div>
                  <span className="text-slate-500 text-[11px]">
                    Showing {comparisonData.comparisons.filter((c) => compareFilter === 'ALL' || c.change === compareFilter).length} requirements
                  </span>
                </div>

                {/* Comparison Table */}
                <div className="max-h-[380px] overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2 px-3 w-24">Req Code</th>
                        <th className="py-2 px-3">Title</th>
                        <th className="py-2 px-3 w-32">Base Status</th>
                        <th className="py-2 px-3 w-32">Head Status</th>
                        <th className="py-2 px-3 w-28 text-center">Change</th>
                        <th className="py-2 px-3 w-20 text-right">Conf Δ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparisonData.comparisons
                        .filter((c) => compareFilter === 'ALL' || c.change === compareFilter)
                        .map((c) => {
                          const isRegressed = c.change === 'REGRESSED';
                          const isImproved = c.change === 'IMPROVED';
                          const isUnknown = c.change === 'CHANGED_UNKNOWN';
                          return (
                            <tr key={c.requirement_id} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{c.req_code}</td>
                              <td className="py-2 px-3 font-medium text-slate-800 line-clamp-1">{c.title}</td>
                              <td className="py-2 px-3">
                                <span className="font-semibold text-[11px] text-slate-700">{c.base_status || '—'}</span>
                                {c.method_base && (
                                  <span className="ml-1 text-[9px] text-slate-500 font-mono">({c.method_base})</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-semibold text-[11px] text-slate-700">{c.head_status || '—'}</span>
                                {c.method_head && (
                                  <span className="ml-1 text-[9px] text-slate-500 font-mono">({c.method_head})</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isRegressed
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : isImproved
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : isUnknown
                                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {c.change}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[11px]">
                                {c.confidence_delta > 0
                                  ? `+${c.confidence_delta}`
                                  : c.confidence_delta < 0
                                  ? `${c.confidence_delta}`
                                  : '0'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Export to CSV / Jira Preview Modal */}
      <PreviewModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export to CSV / Jira"
        subtitle="Preview feature, coming in a future release"
        description="Export requirement traceability matrices directly to external issue trackers, spreadsheets, and enterprise compliance tools."
        bullets={[
          'Export requirement traceability matrices to CSV, Excel, and structured audit formats.',
          'Bi-directional Jira integration to synchronize requirement verification statuses directly to Jira tickets.',
          'Automated webhook notifications when requirement coverage or verification status updates.',
          'Custom column mapping to match enterprise compliance and audit workflows.',
        ]}
      />
    </div>
  );
}
