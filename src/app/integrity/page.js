'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { PreviewModal } from '@/components/ui/PreviewModal.js';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileCode2,
  Lock,
  Cpu,
  Database,
  Terminal,
} from 'lucide-react';

export default function IntegrityPage() {
  const [showProviderModal, setShowProviderModal] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Academic Integrity & Verification Architecture
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            GENESIS Framework — Evidence-Grounded Traceability and Implementation Verification
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowProviderModal(true)}
          className="gap-1.5 text-xs text-slate-700 hover:bg-slate-50 shrink-0 font-medium"
        >
          <Cpu className="w-3.5 h-3.5 text-purple-600" />
          <span>Add second AI provider</span>
          <Badge variant="warning" size="sm">
            Preview
          </Badge>
        </Button>
      </div>

      <Alert variant="integrity" title="Guiding Integrity Principles">
        GENESIS is built upon strict academic software engineering principles. The framework never hallucinates code evidence, never executes unverified source code, and explicitly separates deterministic static analysis from probabilistic AI reasoning.
      </Alert>

      {/* The 4 Canonical Verification Statuses */}
      <Card>
        <CardHeader>
          <CardTitle>The Four Canonical Verification Statuses</CardTitle>
          <CardDescription>
            Every software requirement extracted from an SRS document is mapped into one of four mutually exclusive statuses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-md bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex items-center gap-2">
              <Badge status="VERIFIED" />
              <span className="text-xs font-semibold text-emerald-900">High Confidence Implementation</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Assigned when deterministic code analysis identifies substantive matching components (functions, routes, schemas, test suites) whose logic corresponds directly with the requirement specification.
            </p>
          </div>

          <div className="p-4 rounded-md bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex items-center gap-2">
              <Badge status="PARTIALLY_IMPLEMENTED" />
              <span className="text-xs font-semibold text-amber-900">Incomplete or Stubbed Implementation</span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Assigned when code stubs, mock responses, incomplete endpoints, or partially satisfied requirement clauses are detected in the repository without complete functional logic.
            </p>
          </div>

          <div className="p-4 rounded-md bg-rose-50/70 border border-rose-200 space-y-2">
            <div className="flex items-center gap-2">
              <Badge status="NOT_IMPLEMENTED" />
              <span className="text-xs font-semibold text-rose-900">Conclusively Missing Implementation</span>
            </div>
            <p className="text-xs text-rose-800 leading-relaxed">
              Assigned only when static analysis across all relevant file scopes confirms the complete absence of any related functions, classes, routes, database tables, or configuration tokens.
            </p>
          </div>

          <div className="p-4 rounded-md bg-slate-100 border border-slate-300 space-y-2">
            <div className="flex items-center gap-2">
              <Badge status="UNVERIFIED" />
              <span className="text-xs font-semibold text-slate-800">Insufficient Evidence to Judge</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Crucial integrity safeguard: When the uploaded source code or requirement text does not provide adequate deterministic evidence to make a definitive judgment, the system refuses to guess and assigns UNVERIFIED.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security Architecture & Code Safety */}
      <Card>
        <CardHeader>
          <CardTitle>Security Architecture & Code Ingestion Safety</CardTitle>
          <CardDescription>
            Defense-in-depth measures against malicious code submissions and archive vulnerabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Terminal className="w-4 h-4 text-blue-600" />
              Zero-Execution Policy
            </div>
            <p className="text-slate-600 leading-relaxed">
              Uploaded developer code is strictly parsed statically as text and AST tokens. No interpreter, compiler, or runtime is ever invoked, completely eliminating remote code execution (RCE) vectors.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Lock className="w-4 h-4 text-amber-600" />
              Zip Slip & Archive Bomb Guard
            </div>
            <p className="text-slate-600 leading-relaxed">
              ZIP extraction enforces canonical path boundary checks to prevent path traversal (&quot;../&quot; attacks), file count limits, and uncompressed size quotas to mitigate decompression bombs.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Database className="w-4 h-4 text-emerald-600" />
              Modular Storage Abstraction
            </div>
            <p className="text-slate-600 leading-relaxed">
              Storage operations conform to an abstract `StorageInterface`, currently persisting to a secure local directory and designed for instant plug-and-play migration to cloud S3 or blob storage.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Cpu className="w-4 h-4 text-purple-600" />
              Server-Side Advance Genesis Model Isolation
            </div>
            <p className="text-slate-600 leading-relaxed">
              All Advance Genesis Model credentials and reasoning operations are strictly encapsulated in server-side Next.js route handlers. No API credentials or prompts leak to the frontend client. The Advance Genesis Model is powered by Google Gemini.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Add second AI provider Preview Modal */}
      <PreviewModal
        isOpen={showProviderModal}
        onClose={() => setShowProviderModal(false)}
        title="Add Second AI Provider"
        subtitle="Preview feature, coming in a future release"
        description="Configure secondary AI providers for automatic sequential failover and consensus verification across multiple language models."
        bullets={[
          'Multi-provider failover routing to secondary free-tier AI services when primary quota is exhausted.',
          'Cross-model consensus verification: compare and validate reasoning across multiple models for high-priority requirements.',
          'Local offline model integration (e.g. Ollama, Llama 3) for secure and air-gapped enterprise environments.',
          'Unified provider health monitoring with automatic latency and rate limit tracking.',
        ]}
      />
    </div>
  );
}

