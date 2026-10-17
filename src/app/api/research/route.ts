import { requireBearer } from '@/lib/auth';
import { DispatchError } from '@/lib/errors';
import { errorResponse, getRequestId, jsonResponse, readJson, safeLog } from '@/lib/http';
import { researchInput } from '@/lib/schemas';
import { createResearch } from '@/lib/research-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const body = await readJson(request);
    const parsed = researchInput.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Research parameters are invalid.' },
        requestId,
      }, 422, requestId);
    }
    const rawIdempotencyKey = request.headers.get('idempotency-key');
    if (rawIdempotencyKey !== null && !/^[\x21-\x7e]{1,100}$/.test(rawIdempotencyKey)) {
      return jsonResponse({
        error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key must be 1-100 printable ASCII characters.' },
        requestId,
      }, 422, requestId);
    }
    const result = await createResearch(parsed.data, rawIdempotencyKey ?? undefined, clientId);
    safeLog('research_accepted', { requestId, jobId: result.jobId, status: result.status });
    return jsonResponse(result, 202, requestId);
  } catch (error) {
    if (error instanceof DispatchError) {
      safeLog('research_dispatch_pending', { requestId, jobId: error.jobId });
      return jsonResponse({
        error: { code: 'WORKFLOW_DISPATCH_FAILED', message: 'The research job could not be dispatched yet.' },
        jobId: error.jobId,
        statusUrl: `/api/research/${error.jobId}`,
        requestId,
      }, 503, requestId);
    }
    safeLog('research_submission_error', {
      requestId,
      code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR',
    });
    return errorResponse(error, requestId);
  }
}
