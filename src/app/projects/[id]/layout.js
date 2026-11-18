import { notFound } from 'next/navigation';
import { queryOne } from '@/lib/db/index.js';
import { ProjectNav } from '@/components/projects/ProjectNav.js';

export const dynamic = 'force-dynamic';

export default function ProjectLayout({ children, params }) {
  const { id } = params;

  const project = queryOne(
    `SELECT id, name, status, client_name FROM projects WHERE id = ?`,
    [id]
  );

  if (!project) {
    notFound();
  }

  return <ProjectNav project={{ ...project }}>{children}</ProjectNav>;
}
