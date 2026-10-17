import { verifyCronBearer } from '@/lib/auth';
import { runRetentionCleanup } from '@/lib/maintenance';
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
    const deleted = await runRetentionCleanup();
    return jsonResponse({ status: 'ok', deleted }, 200, requestId);
  } catch (error) {
    safeLog('retention_cleanup_error', { requestId, code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR' });
    return errorResponse(error, requestId);
  }
}
