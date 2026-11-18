import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/index.js';
import { getAiStatus } from '@/lib/ai/gateway.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * System health-check endpoint.
 */
export async function GET() {
  try {
    const dbCheck = queryOne('SELECT 1 as healthy');
    const isDbConnected = dbCheck?.healthy === 1;
    const aiStatus = getAiStatus();

    return NextResponse.json({
      status: isDbConnected ? 'HEALTHY' : 'DEGRADED',
      database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
      ai: aiStatus,
      timestamp: new Date().toISOString(),
      framework: 'GENESIS Requirement Traceability & Verification',
      version: '1.0.0',
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'UNHEALTHY',
        database: 'ERROR',
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

