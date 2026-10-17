import { verifyCronBearer } from '@/lib/auth';
import { runOutboxReconciliation } from '@/lib/maintenance';
import { errorResponse, getRequestId, jsonResponse, safeLog } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  if (!verifyCronBearer(request)) {
    return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' }, requestId }, 401, requestId);
  }
  try {
    const result = await runOutboxReconciliation();
    safeLog('outbox_reconciliation', { requestId, found: result.found, dispatched: result.dispatched });
    return jsonResponse({ status: 'ok', ...result }, 200, requestId);
  } catch (error) {
    safeLog('outbox_reconciliation_error', { requestId, code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR' });
    return errorResponse(error, requestId);
  }
}
