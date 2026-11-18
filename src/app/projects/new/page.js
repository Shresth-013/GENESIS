'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card.js';
import { Input } from '@/components/ui/Input.js';
import { Textarea } from '@/components/ui/Textarea.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { showToast } from '@/components/ui/Toast.js';
import { FolderPlus, ArrowLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Project name is mandatory.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          client_name: clientName.trim(),
          description: description.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create project.');
      }

      showToast(`Project "${json.data?.name || name.trim()}" created successfully`, 'success');
      router.push(`/projects/${json.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Failed to initialize project.');
      showToast(err.message || 'Failed to initialize project', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/projects" className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Projects
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create New Verification Project</CardTitle>
          <CardDescription>
            Step 1 of the GENESIS workflow: Set up the verification workspace before uploading client SRS documentation and developer source code.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="danger" title="Validation Error">
                {error}
              </Alert>
            )}

            <Input
              label="Project Title"
              placeholder="e.g. Student Information Portal / Hospital ERP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              helperText="Give this verification audit a descriptive title."
            />

            <Input
              label="Client / Author Organization"
              placeholder="e.g. Faculty of Computer Science / Client Corp"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              helperText="The stakeholder or organization that owns the Software Requirements Specification (SRS)."
            />

            <Textarea
              label="Verification Scope & Summary"
              placeholder="Describe the scope, intended software stack, or deliverables under audit..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              helperText="Optional context to help categorize requirements during subsequent extraction phases."
            />

            <Alert variant="info" title="What happens next?">
              After creating this project, you will upload the client SRS document (PDF or DOCX). Advance Genesis Model will extract structured, numbered requirements for your review and approval before developer code analysis.
            </Alert>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <Link href="/projects">
                <Button variant="outline" type="button" disabled={isLoading}>
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                icon={FolderPlus}
                isLoading={isLoading}
              >
                Create Project Workspace
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

