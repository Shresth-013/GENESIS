'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal.js';
import { Button } from '@/components/ui/Button.js';
import { Alert } from '@/components/ui/Alert.js';
import { showToast } from '@/components/ui/Toast.js';
import { Trash2, AlertTriangle } from 'lucide-react';

export function DeleteProjectDialog({
  isOpen,
  onClose,
  project,
  onSuccess,
  redirectOnSuccess,
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !project) return null;

  async function handleDelete() {
    setIsDeleting(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete project.');
      }

      if (onSuccess) {
        onSuccess(project.id);
      }

      showToast(`Project "${project.name || 'Project'}" deleted successfully`, 'success');

      onClose();

      if (redirectOnSuccess) {
        router.push(redirectOnSuccess);
      }
    } catch (err) {
      console.error('Delete project failed:', err);
      setError(err.message || 'An unexpected error occurred while deleting the project.');
      showToast(err.message || 'Failed to delete project', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) {
          setError('');
          onClose();
        }
      }}
      title="Delete Project?"
      description="This action is permanent and cannot be undone."
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="danger" title="Deletion Error">
            {error}
          </Alert>
        )}

        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Permanent Data Removal Warning</span>
          </div>
          <p className="leading-relaxed">
            Are you sure you want to permanently delete{' '}
            <strong className="font-semibold text-rose-950">&quot;{project.name}&quot;</strong>?
          </p>
          <p className="text-rose-700 leading-relaxed">
            This action will remove its associated documents, requirements, code submissions, verification results, and generated reports from both the database and file storage.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError('');
              onClose();
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="danger"
            size="sm"
            icon={Trash2}
            isLoading={isDeleting}
            disabled={isDeleting}
            onClick={handleDelete}
          >
            Delete Project
          </Button>
        </div>
      </div>
    </Modal>
  );
}

