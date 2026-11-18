'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button.js';
import { DeleteProjectDialog } from './DeleteProjectDialog.js';
import { Trash2 } from 'lucide-react';

export function ProjectOverviewDeleteButton({ project }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 gap-1.5"
        onClick={() => setIsDialogOpen(true)}
        icon={Trash2}
        title="Delete project"
        aria-label={`Delete project ${project.name}`}
      >
        Delete Project
      </Button>

      <DeleteProjectDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        project={project}
        redirectOnSuccess="/projects"
      />
    </>
  );
}
