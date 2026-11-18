'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { Stepper } from '@/components/ui/Stepper.js';
import { showToast } from '@/components/ui/Toast.js';
import {
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  RefreshCw,
  FileCheck,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function SRSPage({ params }) {
  const { id: projectId } = params;
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [extractError, setExtractError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [extractionSuccess, setExtractionSuccess] = useState(null);
  const [extractionWarning, setExtractionWarning] = useState(null);

  const fileInputRef = useRef(null);

  const activeDoc = documents.find((d) => d.is_active === 1) || documents[0];

  useEffect(() => {
    fetchData();
  }, [projectId]);

  async function fetchData() {
    setIsLoading(true);
    try {
      // 1. Fetch project info
      const projRes = await fetch(`/api/projects/${projectId}`);
      const projJson = await projRes.json();
      if (projJson.success) {
        setProject(projJson.data);
      }

      // 2. Fetch SRS documents
      const docsRes = await fetch(`/api/projects/${projectId}/srs`);
      const docsJson = await docsRes.json();
      if (docsJson.success) {
        setDocuments(docsJson.data);
      }
    } catch (err) {
      console.error('Failed to load project SRS data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileSelect(file) {
    setUploadError('');
    setExtractError('');
    setExtractionSuccess(null);

    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') {
      setUploadError('Unsupported file type. Please upload a PDF (.pdf) or Word document (.docx).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError('File exceeds maximum allowed size of 15 MB.');
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError('');
    setExtractError('');
    setExtractionSuccess(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`/api/projects/${projectId}/srs`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to upload document.');
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('SRS document uploaded successfully', 'success');
      await fetchData();
    } catch (err) {
      setUploadError(err.message || 'An error occurred during upload.');
      showToast(err.message || 'Failed to upload document', 'error');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRunExtraction(docId) {
    if (!docId) return;

    setIsExtracting(true);
    setExtractError('');
    setExtractionSuccess(null);
    setExtractionWarning(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/srs/${docId}/extract`, {
        method: 'POST',
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Advance Genesis Model extraction failed.');
      }

      setExtractionSuccess(json.count);
      if (json.method === 'RULES' || json.warning) {
        setExtractionWarning(
          'Requirements were extracted by Base Genesis Model because the Advance Genesis Model was at capacity. Review them carefully before approving.'
        );
      }
      await fetchData();
    } catch (err) {
      setExtractError(err.message || 'Advance Genesis Model requirement extraction failed.');
      await fetchData();
    } finally {
      setIsExtracting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading SRS specifications...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Workflow Stepper */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Software Requirements Specification (SRS)
              </h1>
              <Badge variant="brand" size="sm">Phase 2</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload client SRS documentation (PDF / DOCX) to extract verifiable software requirements via Advance Genesis Model.
            </p>
          </div>

          {activeDoc && activeDoc.status === 'REQUIREMENTS_GENERATED' && (
            <Link href={`/projects/${projectId}/requirements`}>
              <Button size="sm" variant="primary" icon={ArrowRight}>
                Review Extracted Requirements
              </Button>
            </Link>
          )}
        </div>

        <Stepper currentStep={1} projectId={projectId} />
      </div>

      {/* Document Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upload SRS Document (PDF or DOCX)</CardTitle>
          <CardDescription>
            Files are validated against path traversal, stored in isolated storage, and parsed without executing untrusted code.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {uploadError && (
            <Alert variant="danger" title="Upload Validation Error">
              {uploadError}
            </Alert>
          )}

          {/* Drag & Drop Upload Gateway */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragOver
                ? 'border-blue-500 bg-blue-50/50'
                : selectedFile
                ? 'border-blue-300 bg-blue-50/20'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">
                  Click to browse or drag and drop your SRS document
                </p>
                <p className="text-xs text-slate-500">
                  Supports Adobe PDF (.pdf) and Microsoft Word (.docx) up to 15 MB
                </p>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploading}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={UploadCloud}
                onClick={handleUpload}
                isLoading={isUploading}
              >
                Upload and Extract Text
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Document Details & Gemini Extraction Panel */}
      {activeDoc ? (
        <Card className="border-blue-200">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <CardTitle className="text-base text-slate-900">{activeDoc.original_name}</CardTitle>
                  <Badge
                    variant={
                      activeDoc.status === 'REQUIREMENTS_GENERATED'
                        ? 'verified'
                        : activeDoc.status === 'EXTRACTED'
                        ? 'approved'
                        : activeDoc.status === 'EXTRACTION_FAILED'
                        ? 'missing'
                        : activeDoc.status === 'NO_REQUIREMENTS_FOUND'
                        ? 'neutral'
                        : 'pending'
                    }
                    size="sm"
                  >
                    {activeDoc.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <CardDescription>
                  Uploaded on {new Date(activeDoc.created_at).toLocaleDateString()} • Size: {(activeDoc.file_size / 1024).toFixed(1)} KB • {activeDoc.page_count} pages • {activeDoc.paragraph_count} sections
                </CardDescription>
              </div>

              {/* Gemini Trigger Button */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={Sparkles}
                  isLoading={isExtracting}
                  onClick={() => handleRunExtraction(activeDoc.id)}
                >
                  {activeDoc.status === 'REQUIREMENTS_GENERATED'
                    ? 'Re-extract with Advance Genesis Model'
                    : 'Extract Requirements with Advance Genesis Model'}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {(extractionWarning || (activeDoc.status === 'REQUIREMENTS_GENERATED' && activeDoc.extraction_method === 'RULES')) && (
              <Alert variant="warning">
                Requirements were extracted by Base Genesis Model because the Advance Genesis Model was at capacity. Review them carefully before approving.
              </Alert>
            )}

            {extractError && (
              <Alert variant="danger" title="Advance Genesis Model Extraction Warning">
                {extractError}
              </Alert>
            )}

            {extractionSuccess !== null && (
              <Alert
                variant={extractionSuccess === 0 ? 'info' : 'success'}
                title={extractionSuccess === 0 ? 'No Requirements Identified' : 'Extraction Completed'}
              >
                {extractionSuccess === 0
                  ? 'Advance Genesis Model analyzed the document text successfully, but could not identify any concrete, verifiable software requirements. You may upload a more detailed SRS document or refine the document text.'
                  : `Successfully identified and generated ${extractionSuccess} verifiable software requirements! You can now review, edit, and approve them.`}
              </Alert>
            )}

            {activeDoc.status === 'EXTRACTION_FAILED' && activeDoc.error_message && (
              <Alert variant="danger" title="Previous Extraction Error">
                {activeDoc.error_message}
              </Alert>
            )}

            {/* Document Text Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                  Extracted Document Text
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullText(!showFullText)}
                  className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  {showFullText ? (
                    <>
                      <span>Collapse</span>
                      <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      <span>Expand Text</span>
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>

              <div
                className={`text-xs text-slate-700 font-mono whitespace-pre-wrap bg-white p-3 rounded border border-slate-200 overflow-y-auto leading-relaxed ${
                  showFullText ? 'max-h-96' : 'max-h-32'
                }`}
              >
                {activeDoc.text_preview || 'No text extracted.'}
              </div>
            </div>
          </CardContent>

          {activeDoc.status === 'REQUIREMENTS_GENERATED' && (
            <CardFooter className="flex items-center justify-between bg-blue-50/30">
              <span className="text-xs text-slate-600">
                Requirements are extracted and waiting for human review.
              </span>
              <Link href={`/projects/${projectId}/requirements`}>
                <Button size="sm" variant="primary" icon={ArrowRight}>
                  Review & Approve Requirements
                </Button>
              </Link>
            </CardFooter>
          )}
        </Card>
      ) : (
        <div className="text-center py-10 px-4 bg-white border border-dashed border-slate-200 rounded-lg space-y-3">
          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-slate-700">No SRS document uploaded yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload your software requirements document above to start Phase 2.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Document to Upload
          </Button>
        </div>
      )}

      {/* Version History (if multiple versions uploaded) */}
      {documents.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Document Version History</CardTitle>
            <CardDescription>
              All previous SRS uploads for this project. Only the latest active document is used for requirement verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 text-xs">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{doc.original_name}</span>
                      {doc.is_active === 1 && <Badge variant="brand" size="sm">Active</Badge>}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Uploaded {new Date(doc.created_at).toLocaleString()} • Size: {(doc.file_size / 1024).toFixed(1)} KB • Status: {doc.status}
                    </div>
                  </div>

                  {doc.is_active !== 1 && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleRunExtraction(doc.id)}
                    >
                      Extract From This Version
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
