'use client';

import React, { useState, useEffect } from 'react';
import { ProjectCard } from './ProjectCard.js';
import { DeleteProjectDialog } from './DeleteProjectDialog.js';
import { Input } from '@/components/ui/Input.js';
import { Button } from '@/components/ui/Button.js';
import { Search, FolderOpen, Plus } from 'lucide-react';

export function ProjectList({ initialProjects = [], onCreateClick }) {
  const [projects, setProjects] = useState(initialProjects);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const filteredProjects = projects.filter((project) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      project.name?.toLowerCase().includes(term) ||
      project.client_name?.toLowerCase().includes(term) ||
      project.description?.toLowerCase().includes(term)
    );
  });

  function handleProjectDeleted(deletedId) {
    setProjects((prev) => prev.filter((p) => p.id !== deletedId));
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Search projects by name, client or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredProjects.length} of {projects.length} projects
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDeleteClick={(p) => setProjectToDelete(p)}
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-dashed border-slate-300 rounded-lg space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">No Verification Projects Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Start by creating a project. You can then upload an SRS document, extract structured requirements, and verify developer source code.
            </p>
          </div>
          {onCreateClick && (
            <Button size="sm" variant="primary" icon={Plus} onClick={onCreateClick}>
              Create First Project
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center py-12 px-4 bg-white border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500">
            No projects matched your search &quot;{searchTerm}&quot;.
          </p>
        </div>
      )}

      {/* Reusable Delete Confirmation Dialog */}
      <DeleteProjectDialog
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        project={projectToDelete}
        onSuccess={handleProjectDeleted}
      />
    </div>
  );
}

