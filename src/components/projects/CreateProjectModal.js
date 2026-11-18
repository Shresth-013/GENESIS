'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal.js';
import { Input } from '@/components/ui/Input.js';
import { Textarea } from '@/components/ui/Textarea.js';
import { Button } from '@/components/ui/Button.js';
import { showToast } from '@/components/ui/Toast.js';
import { FolderPlus, AlertCircle } from 'lucide-react';

export function CreateProjectModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please provide a project name.');
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
        throw new Error(json.error || 'Failed to create project');
      }

      // Reset form
      setName('');
      setClientName('');
      setDescription('');
      showToast(`Project "${json.data?.name || 'Project'}" created successfully`, 'success');
      if (onCreated) {
        onCreated(json.data);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while creating the project.');
      showToast(err.message || 'Failed to create project', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Verification Project"
      description="Initialize a new evidence-grounded software verification workspace for your client SRS and code submission."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Project Name"
          placeholder="e.g. HealthCare Portal Phase 1 or Enterprise CRM"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />

        <Input
          label="Client / Stakeholder Organization"
          placeholder="e.g. Apex Health Systems, LLC"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          helperText="Identifies who authored or commissioned the Software Requirements Specification (SRS)."
        />

        <Textarea
          label="Description / Scope Summary"
          placeholder="Brief description of the software deliverables and scope of the verification audit..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={FolderPlus}
            isLoading={isLoading}
          >
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}

