'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Textarea } from '@/components/ui/Textarea.js';
import { Modal } from '@/components/ui/Modal.js';
import { Alert } from '@/components/ui/Alert.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { showToast } from '@/components/ui/Toast.js';
import { VALID_CATEGORIES, VALID_PRIORITIES } from '@/lib/ai/constants.js';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Sparkles,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
  Filter,
  CheckSquare,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

export default function RequirementsReviewPage({ params }) {
  const { id: projectId } = params;
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [activeDoc, setActiveDoc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Multi-selection for bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Modals state
  const [editingReq, setEditingReq] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New requirement form state
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('FUNCTIONAL');
  const [newPri, setNewPri] = useState('MEDIUM');
  const [newCriteria, setNewCriteria] = useState('');

  useEffect(() => {
    fetchData();
  }, [projectId, statusFilter, categoryFilter, priorityFilter]);

  async function fetchData() {
    setIsLoading(true);
    try {
      // 1. Fetch project info
      const projRes = await fetch(`/api/projects/${projectId}`);
      const projJson = await projRes.json();
      if (projJson.success) {
        setProject(projJson.data);
        setActiveDoc(projJson.data.srs);
      }

      // 2. Build query parameters
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());

      const reqRes = await fetch(`/api/projects/${projectId}/requirements?${params.toString()}`);
      const reqJson = await reqRes.json();
      if (reqJson.success) {
        setRequirements(reqJson.data);
        setSummary(reqJson.summary);
      }
    } catch (err) {
      console.error('Failed to load requirements data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle single requirement approval / rejection
  async function handleUpdateStatus(reqId, newStatus) {
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(
          newStatus === 'APPROVED' ? 'Requirement approved' : 'Requirement rejected',
          'success'
        );
        await fetchData();
        // Remove from selection if selected
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(reqId);
          return next;
        });
      } else {
        showToast(json.error || 'Failed to update requirement status', 'error');
      }
    } catch (err) {
      console.error('Failed to update requirement status:', err);
      showToast(err.message || 'Failed to update requirement status', 'error');
    }
  }

  // Handle single requirement deletion
  async function handleDelete(reqId) {
    if (!window.confirm('Are you sure you want to delete this requirement?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/${reqId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(reqId);
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to delete requirement:', err);
    }
  }

  // Handle bulk action (Approve or Reject selected)
  async function handleBulkAction(action) {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setIsBulkProcessing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/bulk-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(
          `${count} requirement${count === 1 ? '' : 's'} ${action === 'APPROVE' ? 'approved' : 'rejected'}`,
          'success'
        );
        setSelectedIds(new Set());
        await fetchData();
      } else {
        showToast(json.error || 'Bulk action failed', 'error');
      }
    } catch (err) {
      console.error('Bulk action failed:', err);
      showToast(err.message || 'Bulk action failed', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  }

  // Handle Edit form submission
  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editingReq) return;
    setIsSubmitting(true);
    setModalError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements/${editingReq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          req_code: editingReq.req_code,
          description: editingReq.description,
          category: editingReq.category,
          priority: editingReq.priority,
          acceptance_criteria: editingReq.acceptance_criteria_text
            ? editingReq.acceptance_criteria_text.split('\n').filter(Boolean)
            : editingReq.acceptance_criteria,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update requirement');
      }

      setEditingReq(null);
      await fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Add manual requirement
  async function handleAddSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          req_code: newCode.trim(),
          description: newDesc.trim(),
          category: newCat,
          priority: newPri,
          acceptance_criteria: newCriteria.split('\n').filter(Boolean),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create requirement');
      }

      setIsAddModalOpen(false);
      setNewCode('');
      setNewDesc('');
      setNewCriteria('');
      await fetchData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Select all toggle
  function handleSelectAll(e) {
    if (e.target.checked) {
      const allIds = new Set(requirements.map((r) => r.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleToggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Filtered requirements by client search term
  const displayedRequirements = requirements.filter((req) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      req.req_code?.toLowerCase().includes(term) ||
      req.description?.toLowerCase().includes(term) ||
      req.category?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header and Stepper */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Software Requirements Review & Approval
              </h1>
              <Badge variant="brand" size="sm">Phase 2</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Human-in-the-loop review of Advance Genesis Model-extracted requirements. Only approved requirements proceed to source-code verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={() => {
                setModalError('');
                setIsAddModalOpen(true);
              }}
            >
              Add Requirement
            </Button>
            <Link href={`/projects/${projectId}/srs`}>
              <Button size="sm" variant="outline" icon={FileText}>
                SRS Document
              </Button>
            </Link>
          </div>
        </div>

        <Stepper currentStep={2} projectId={projectId} />
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Total Extracted</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{summary.total}</div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{summary.approved}</span>
            <span className="text-[11px] text-slate-500">
              {summary.total > 0 ? `${Math.round((summary.approved / summary.total) * 100)}% approved` : ''}
            </span>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-600">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{summary.pending}</div>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-600">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Rejected</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{summary.rejected}</div>
        </Card>
      </div>

      {/* Filter and Action Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Top row: Search and Filter select boxes */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder="Search by code, description, or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Categories</option>
                {VALID_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Priorities</option>
                {VALID_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom row: Status Pills & Bulk Action triggers */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5">
              {[
                { key: 'ALL', label: `All (${summary.total})` },
                { key: 'PENDING', label: `Pending (${summary.pending})` },
                { key: 'APPROVED', label: `Approved (${summary.approved})` },
                { key: 'REJECTED', label: `Rejected (${summary.rejected})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Bulk Action Controls */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200 animate-in fade-in">
                <span className="text-xs font-semibold text-blue-900">
                  {selectedIds.size} selected:
                </span>
                <Button
                  size="xs"
                  variant="primary"
                  icon={Check}
                  isLoading={isBulkProcessing}
                  onClick={() => handleBulkAction('APPROVE')}
                >
                  Approve Selected
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  icon={X}
                  disabled={isBulkProcessing}
                  onClick={() => handleBulkAction('REJECT')}
                >
                  Reject Selected
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Requirements Table */}
      <Card>
        <CardHeader className="py-3 px-6 bg-slate-50/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label="Select all visible requirements"
              checked={
                displayedRequirements.length > 0 &&
                displayedRequirements.every((r) => selectedIds.has(r.id))
              }
              onChange={handleSelectAll}
              className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
            />
            <span className="text-xs font-semibold text-slate-700">
              Showing {displayedRequirements.length} Requirements
            </span>
          </div>

          {summary.pending > 0 && (
            <Button
              size="xs"
              variant="subtle"
              icon={CheckSquare}
              disabled={isBulkProcessing}
              onClick={async () => {
                if (window.confirm(`Approve all ${summary.pending} pending requirements?`)) {
                  const pendingIds = requirements
                    .filter((r) => r.approval_status === 'PENDING')
                    .map((r) => r.id);
                  if (pendingIds.length > 0) {
                    setIsBulkProcessing(true);
                    try {
                      const res = await fetch(`/api/projects/${projectId}/requirements/bulk-approval`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: pendingIds, action: 'APPROVE' }),
                      });
                      const json = await res.json();
                      if (json.success) {
                        showToast(`All ${pendingIds.length} pending requirements approved`, 'success');
                        await fetchData();
                      } else {
                        showToast(json.error || 'Failed to approve all pending requirements', 'error');
                      }
                    } catch (err) {
                      showToast(err.message || 'Failed to approve all pending requirements', 'error');
                    } finally {
                      setIsBulkProcessing(false);
                    }
                  }
                }
              }}
            >
              Approve All Pending ({summary.pending})
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-xs">Loading requirements...</p>
            </div>
          ) : displayedRequirements.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {displayedRequirements.map((req) => {
                const isSelected = selectedIds.has(req.id);
                const sourceRef = req.source_reference;

                return (
                  <div
                    key={req.id}
                    className={`p-4 md:px-6 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4 ${
                      isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Left: Checkbox & Requirement Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        aria-label={`Select requirement ${req.req_code}`}
                        checked={isSelected}
                        onChange={() => handleToggleSelect(req.id)}
                        className="w-4 h-4 mt-1 rounded text-blue-600 border-slate-300 focus:ring-blue-500 shrink-0"
                      />

                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* Requirement Code & Metadata Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {req.req_code}
                          </span>

                          <Badge variant="brand" size="sm">
                            {req.category}
                          </Badge>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                              req.priority === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : req.priority === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {req.priority}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                              req.extraction_method === 'RULES'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                            title={req.extraction_method === 'RULES' ? 'Extracted using Base Genesis Model' : 'Extracted using Advance Genesis Model'}
                          >
                            {req.extraction_method === 'RULES' ? 'Base Genesis Model' : 'Advance Genesis Model'}
                          </span>

                          {sourceRef && (
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                              {sourceRef.section ? `${sourceRef.section} ` : ''}
                              {sourceRef.page ? `(p. ${sourceRef.page})` : ''}
                              {sourceRef.reference || ''}
                            </span>
                          )}

                          <Badge status={req.approval_status} size="sm" />
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-800 leading-relaxed font-normal">
                          {req.description}
                        </p>

                        {/* Acceptance Criteria (if available) */}
                        {Array.isArray(req.acceptance_criteria) && req.acceptance_criteria.length > 0 && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-200 space-y-1 mt-2 text-[11px]">
                            <span className="font-semibold text-slate-600 block text-[10px] uppercase tracking-wide">
                              Acceptance Criteria:
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-700 pl-1">
                              {req.acceptance_criteria.map((crit, idx) => (
                                <li key={idx} className="leading-tight">
                                  {crit}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Extraction Notes (if flagged for ambiguity) */}
                        {req.extraction_notes && (
                          <div className="text-[11px] text-amber-800 bg-amber-50/70 border border-amber-200 p-1.5 rounded flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{req.extraction_notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Individual Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-start">
                      {req.approval_status !== 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(req.id, 'APPROVED')}
                          className="px-2.5 py-1 text-xs rounded font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1"
                          title="Approve requirement"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                      )}

                      {req.approval_status !== 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                          className="px-2.5 py-1 text-xs rounded font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1"
                          title="Reject requirement"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setModalError('');
                          setEditingReq({
                            ...req,
                            acceptance_criteria_text: Array.isArray(req.acceptance_criteria)
                              ? req.acceptance_criteria.join('\n')
                              : '',
                          });
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-colors"
                        title="Edit requirement"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(req.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors"
                        title="Delete requirement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 px-4 space-y-3">
              <Layers className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {summary.total === 0 ? 'No Requirements Extracted Yet' : 'No Matching Requirements'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {summary.total === 0
                    ? 'Upload an SRS document in Step 1 to trigger Advance Genesis Model requirement extraction, or manually add requirements.'
                    : `No requirements found matching category "${categoryFilter}" and priority "${priorityFilter}".`}
                </p>
              </div>

              {summary.total === 0 && (
                <div className="pt-2 flex items-center justify-center gap-3">
                  <Link href={`/projects/${projectId}/srs`}>
                    <Button size="sm" variant="primary" icon={FileText}>
                      Upload SRS Document
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={Plus}
                    onClick={() => setIsAddModalOpen(true)}
                  >
                    Add Manually
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Requirement Modal */}
      {editingReq && (
        <Modal
          isOpen={!!editingReq}
          onClose={() => setEditingReq(null)}
          title={`Edit Requirement: ${editingReq.req_code}`}
          description="Adjust requirement phrasing, category, priority or acceptance criteria."
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {modalError && (
              <Alert variant="danger" title="Validation Error">
                {modalError}
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Requirement Code"
                value={editingReq.req_code}
                onChange={(e) => setEditingReq({ ...editingReq, req_code: e.target.value })}
                required
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={editingReq.category}
                  onChange={(e) => setEditingReq({ ...editingReq, category: e.target.value })}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {VALID_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Priority
                </label>
                <select
                  value={editingReq.priority}
                  onChange={(e) => setEditingReq({ ...editingReq, priority: e.target.value })}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {VALID_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Requirement Description"
              value={editingReq.description}
              onChange={(e) => setEditingReq({ ...editingReq, description: e.target.value })}
              rows={4}
              required
            />

            <Textarea
              label="Acceptance Criteria (one per line)"
              value={editingReq.acceptance_criteria_text || ''}
              onChange={(e) =>
                setEditingReq({ ...editingReq, acceptance_criteria_text: e.target.value })
              }
              rows={3}
              placeholder="e.g. System responds in under 2 seconds&#10;Password requires 8+ characters"
            />

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingReq(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Manual Requirement Modal */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Manual Requirement"
          description="Create a custom or implicit requirement to include in software verification."
        >
          <form onSubmit={handleAddSubmit} className="space-y-4">
            {modalError && (
              <Alert variant="danger" title="Validation Error">
                {modalError}
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Requirement Code"
                placeholder="e.g. REQ-999"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                helperText="Leave empty to auto-assign"
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {VALID_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Priority
                </label>
                <select
                  value={newPri}
                  onChange={(e) => setNewPri(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {VALID_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Requirement Description"
              placeholder="e.g. The application shall encrypt stored authentication tokens with AES-256."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={4}
              required
            />

            <Textarea
              label="Acceptance Criteria (one per line)"
              placeholder="e.g. Encryption key is rotated every 90 days&#10;Plaintext tokens are never written to disk"
              value={newCriteria}
              onChange={(e) => setNewCriteria(e.target.value)}
              rows={3}
            />

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                Create Requirement
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
