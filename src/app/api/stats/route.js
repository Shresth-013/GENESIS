import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db/index.js';

// GET /api/stats - Aggregated metrics across all projects
export async function GET() {
  try {
    const projectStats = queryOne(`
      SELECT 
        COUNT(*) as total_projects,
        SUM(CASE WHEN status = 'CREATED' THEN 1 ELSE 0 END) as created_count,
        SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified_count
      FROM projects
    `);

    const requirementStats = queryOne(`
      SELECT 
        COUNT(*) as total_requirements,
        SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) as pending_count
      FROM requirements
    `);

    const verificationStats = queryOne(`
      SELECT 
        COUNT(*) as total_verified_evals,
        SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'PARTIALLY_IMPLEMENTED' THEN 1 ELSE 0 END) as partially_implemented,
        SUM(CASE WHEN status = 'NOT_IMPLEMENTED' THEN 1 ELSE 0 END) as not_implemented,
        SUM(CASE WHEN status = 'UNVERIFIED' THEN 1 ELSE 0 END) as unverified
      FROM verification_results
    `);

    const recentProjects = queryAll(`
      SELECT id, name, client_name, status, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
      LIMIT 5
    `);

    return NextResponse.json({
      success: true,
      data: {
        projects: {
          total: projectStats?.total_projects || 0,
          created: projectStats?.created_count || 0,
          verified: projectStats?.verified_count || 0,
        },
        requirements: {
          total: requirementStats?.total_requirements || 0,
          approved: requirementStats?.approved_count || 0,
          pending: requirementStats?.pending_count || 0,
        },
        verifications: {
          total: verificationStats?.total_verified_evals || 0,
          verified: verificationStats?.verified || 0,
          partiallyImplemented: verificationStats?.partially_implemented || 0,
          notImplemented: verificationStats?.not_implemented || 0,
          unverified: verificationStats?.unverified || 0,
        },
        recentProjects: recentProjects || [],
      },
    });
  } catch (error) {
    console.error('Failed to calculate stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute statistics', message: error.message },
      { status: 500 }
    );
  }
}

