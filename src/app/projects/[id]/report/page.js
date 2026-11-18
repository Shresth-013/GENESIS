'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { PreviewModal } from '@/components/ui/PreviewModal.js';
import {
  FileText,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Layers,
  FileCheck2,
  HardDrive,
  Hash,
  Loader2,
  Calendar,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export default function ReportPage({ params }) {
  const { id: projectId } = params;
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [runs, setRuns] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '', downloadUrl: null });

  useEffect(() => {
    fetchInitialData();
  }, [projectId]);

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      // 1. Fetch project details
      const projRes = await fetch(`/api/projects/${projectId}`);
      const projData = await projRes.json();
      if (projData.success) {
        setProject(projData.data);
      }

      // 2. Fetch verification runs
      const runsRes = await fetch(`/api/projects/${projectId}/verification`);
      const runsData = await runsRes.json();
      if (runsData.success) {
        const rawRuns = Array.isArray(runsData.data?.runs)
          ? runsData.data.runs
          : Array.isArray(runsData.data)
          ? runsData.data
          : [];
        const completedRuns = rawRuns.filter((r) => r.status === 'COMPLETED');
        setRuns(completedRuns);
        if (completedRuns.length > 0) {
          setSelectedRunId((prev) => (prev && completedRuns.some((r) => r.id === prev) ? prev : completedRuns[0].id));
        }
      }

      // 3. Fetch existing reports
      await fetchReports();
    } catch (err) {
      console.error('Error fetching report data:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to load project or report data.' });
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchReports() {
    try {
      const repRes = await fetch(`/api/projects/${projectId}/reports`);
      const repData = await repRes.json();
      if (repData.success) {
        const rawReports = Array.isArray(repData.data)
          ? repData.data
          : Array.isArray(repData.data?.reports)
          ? repData.data.reports
          : [];
        setReports(rawReports);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  }

  async function handleGenerateReport() {
    const targetRunId = selectedRunId || (runs[0]?.id);
    if (!targetRunId) {
      setFeedback({ type: 'error', message: 'Please select a completed verification run first.' });
      return;
    }

    setIsGenerating(true);
    setFeedback({ type: '', message: '', downloadUrl: null });

    try {
      const res = await fetch(`/api/projects/${projectId}/verification/${targetRunId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate report.');
      }

      const newReport = json.data;
      setFeedback({
        type: 'success',
        message: `Audit report "${newReport.reportName}" generated successfully.`,
        downloadUrl: newReport.downloadUrl,
      });

      await fetchReports();
    } catch (err) {
      console.error('Report generation error:', err);
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0] || null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header & Stepper Skeleton */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Phase 5: Audit Verification PDF Report
                </h1>
                <Badge variant="navy">RELEASE READY</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Loading project verification data and historical audit reports...
              </p>
            </div>
          </div>
          <Stepper currentStep={5} projectId={projectId} />
        </div>

        {/* Loading Spinner Box */}
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center shadow-xs">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-800">Loading Report & Verification Data...</h3>
          <p className="text-xs text-slate-500 mt-1">
            Retrieving completed verification runs, evidence metrics, and audit history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Stepper */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Phase 5: Audit Verification PDF Report
              </h1>
              <Badge variant="navy">RELEASE READY</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Generate, inspect, and export formal academic audit reports with complete code citations,
              acceptance criteria assessments, and integrity disclaimers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export to CSV / Jira</span>
              <Badge variant="warning" size="sm">
                Preview
              </Badge>
            </Button>
            <Link href={`/projects/${projectId}/matrix`}>
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs">
                <Layers className="w-3.5 h-3.5" />
                View Traceability Matrix
              </Button>
            </Link>
          </div>
        </div>

        <Stepper currentStep={5} projectId={projectId} />
      </div>

      {/* Feedback Alerts */}
      {feedback.message && (
        <Alert
          variant={feedback.type === 'error' ? 'danger' : 'success'}
          title={feedback.type === 'error' ? 'Report Generation Failed' : 'Report Generated Successfully'}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{feedback.message}</span>
            {feedback.downloadUrl && (
              <a href={feedback.downloadUrl} download>
                <Button size="sm" variant="primary" className="flex items-center gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  Download PDF Now
                </Button>
              </a>
            )}
          </div>
        </Alert>
      )}

      {/* Main Generation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-navy-700" />
              Generate Audit Report
            </CardTitle>
            <CardDescription>
              Export a formal PDF document grounded strictly in persisted verification results and static source-code evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {runs.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">No Completed Verification Runs Available</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Before generating an audit PDF report, you must run the verification workflow in Phase 4.
                </p>
                <div className="mt-4">
                  <Link href={`/projects/${projectId}/matrix`}>
                    <Button size="sm" variant="primary">
                      Go to Traceability Matrix
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Completed Verification Run
                  </label>
                  <select
                    value={selectedRunId}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-navy-500"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        Run: {r.id} ({new Date(r.completed_at || r.started_at).toLocaleString()}) — {r.total_requirements} Requirements
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRun && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-200 pb-2">
                      <span className="font-semibold text-slate-800">Run Summary: {selectedRun.id}</span>
                      <Badge variant="success">COMPLETED</Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-white rounded border border-slate-100">
                        <div className="text-lg font-bold text-emerald-600">{selectedRun.verified_count}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Verified</div>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-100">
                        <div className="text-lg font-bold text-amber-600">{selectedRun.partially_count}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Partially</div>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-100">
                        <div className="text-lg font-bold text-rose-600">{selectedRun.not_implemented_count}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Not Impl.</div>
                      </div>
                      <div className="p-2 bg-white rounded border border-slate-100">
                        <div className="text-lg font-bold text-slate-500">{selectedRun.unverified_count}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Unverified</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-1">
                      <div>Total Requirements Evaluated: <span className="font-medium text-slate-700">{selectedRun.total_requirements}</span></div>
                      <div>Evaluation Timestamp: <span className="font-medium text-slate-700">{new Date(selectedRun.completed_at || selectedRun.started_at).toLocaleString()}</span></div>
                      <div>Engine Model: <span className="font-mono text-slate-700">Advance Genesis Model</span></div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-400">
                    PDF document is generated strictly from persisted SQLite records.
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGenerateReport}
                    disabled={isGenerating || !selectedRun}
                    className="flex items-center gap-1.5"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating PDF Report...
                      </>
                    ) : (
                      <>
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Generate PDF Report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Academic Integrity & Methodology Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Academic Audit Integrity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs text-slate-600">
            <div className="space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>1. Evidence Grounding</span>
              </div>
              <p className="text-slate-500 leading-relaxed pl-5">
                Every code citation (file path, line numbers, function/class identifiers) originates from deterministic AST and static analysis records.
              </p>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>2. Zero Untrusted Execution</span>
              </div>
              <p className="text-slate-500 leading-relaxed pl-5">
                GENESIS never executes submitted code or installs dependencies. Verification reflects structural presence, not runtime execution.
              </p>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>3. Human Review Disclosure</span>
              </div>
              <p className="text-slate-500 leading-relaxed pl-5">
                Requirements are human-approved in Phase 2. Verification statuses represent evidence-grounded interpretation; human overrides are tracked with a permanent audit trail.
              </p>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>4. Immutable Report History</span>
              </div>
              <p className="text-slate-500 leading-relaxed pl-5">
                Generating newer reports never alters historical records. All versions remain preserved in SQLite and local storage.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Generated Reports Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-600" />
                Generated Verification Reports ({reports.length})
              </CardTitle>
              <CardDescription>
                Historical audit reports generated for this project. All files remain durably accessible.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchReports}
              className="flex items-center gap-1 text-xs text-slate-500"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-3">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-700">No Reports Generated Yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {runs.length > 0
                    ? 'Generate your first formal verification report from a completed audit run above.'
                    : 'Execute a verification run in Phase 4 before generating your audit PDF report.'}
                </p>
              </div>
              {runs.length === 0 && (
                <div className="pt-1">
                  <Link href={`/projects/${projectId}/matrix`}>
                    <Button size="xs" variant="primary">
                      Go to Traceability Matrix
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 font-semibold">Report Name</th>
                    <th className="py-2.5 px-3 font-semibold">Verification Run</th>
                    <th className="py-2.5 px-3 font-semibold">Generated Date</th>
                    <th className="py-2.5 px-3 font-semibold">Version</th>
                    <th className="py-2.5 px-3 font-semibold">File Size</th>
                    <th className="py-2.5 px-3 font-semibold">SHA-256 Checksum</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.map((rep) => (
                    <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-medium text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-navy-600 flex-shrink-0" />
                        <span className="truncate max-w-xs" title={rep.reportName}>
                          {rep.reportName}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {rep.verificationRunId ? rep.verificationRunId.slice(0, 12) + '...' : 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(rep.generatedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="slate" size="sm">
                          v{rep.reportVersion || '1.0.0'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {rep.fileSize ? `${(rep.fileSize / 1024).toFixed(1)} KB` : 'N/A'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-400" title={rep.reportSha256}>
                        {rep.reportSha256 ? `${rep.reportSha256.slice(0, 10)}...` : 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <a href={rep.downloadUrl} download>
                          <Button size="sm" variant="secondary" className="flex items-center gap-1 text-xs">
                            <Download className="w-3 h-3" />
                            Download PDF
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export to CSV / Jira Preview Modal */}
      <PreviewModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export to CSV / Jira"
        subtitle="Preview feature, coming in a future release"
        description="Export verification report datasets and traceability matrices directly to external issue trackers, CSV/Excel spreadsheets, and compliance archives."
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
