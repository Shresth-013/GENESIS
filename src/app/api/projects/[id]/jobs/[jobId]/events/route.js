import { getJob, subscribeJobEvents } from '@/lib/jobs/jobQueue.js';
import { queryOne } from '@/lib/db/index.js';

export const dynamic = 'force-dynamic';

// GET /api/projects/[id]/jobs/[jobId]/events - Server-Sent Events (SSE) job stream
export async function GET(request, { params }) {
  const { id: projectId, jobId } = params;

  const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const initialJob = getJob(jobId);
  if (!initialJob || initialJob.projectId !== projectId) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      function sendEvent(eventType, data) {
        if (isClosed) return;
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          cleanup();
        }
      }

      // 1. Send initial state
      sendEvent('initial', { job: initialJob });

      // If already finished, close immediately
      if (
        initialJob.status === 'SUCCEEDED' ||
        initialJob.status === 'FAILED' ||
        initialJob.status === 'CANCELLED'
      ) {
        controller.close();
        isClosed = true;
        return;
      }

      // 2. Subscribe to job events
      const unsubscribe = subscribeJobEvents(jobId, (eventData) => {
        if (isClosed) return;
        sendEvent(eventData.event || 'message', eventData);

        const status = eventData.job?.status;
        if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
          cleanup();
        }
      });

      // 3. Fallback poll interval every 1 second in case event was missed
      const pollTimer = setInterval(() => {
        if (isClosed) return;
        const current = getJob(jobId);
        if (!current) {
          cleanup();
          return;
        }

        sendEvent('poll', { job: current });

        if (
          current.status === 'SUCCEEDED' ||
          current.status === 'FAILED' ||
          current.status === 'CANCELLED'
        ) {
          cleanup();
        }
      }, 1000);

      function cleanup() {
        if (isClosed) return;
        isClosed = true;
        clearInterval(pollTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      }

      // 4. Handle client disconnection
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

