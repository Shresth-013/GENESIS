import React from 'react';
import Link from 'next/link';
import { queryAll } from '@/lib/db/index.js';
import { ProjectList } from '@/components/projects/ProjectList.js';
import { Button } from '@/components/ui/Button.js';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  const projects = (queryAll(`
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) as total_requirements,
      (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'APPROVED') as approved_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'VERIFIED') as verified_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'PARTIALLY_IMPLEMENTED') as partial_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'NOT_IMPLEMENTED') as missing_requirements,
      (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'UNVERIFIED') as unverified_requirements,
      (SELECT COUNT(*) FROM srs_documents s WHERE s.project_id = p.id) as srs_count,
      (SELECT COUNT(*) FROM code_submissions c WHERE c.project_id = p.id) as code_count
    FROM projects p
    ORDER BY p.created_at DESC
  `) || []).map((row) => ({ ...row }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Verification Projects
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage SRS requirements audits, developer code submissions, and grounded traceability matrices.
          </p>
        </div>

        <Link href="/projects/new">
          <Button size="sm" variant="primary" icon={Plus}>
            New Project
          </Button>
        </Link>
      </div>

      {/* Projects List with Search */}
      <ProjectList initialProjects={projects} />
    </div>
  );
}

