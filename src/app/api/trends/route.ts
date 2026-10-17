import { requireBearer } from '@/lib/auth';
import { errors } from '@/lib/errors';
import { errorResponse, getRequestId, jsonResponse, safeLog } from '@/lib/http';
import { trendKeywordInput } from '@/lib/schemas';
import { getTrends } from '@/lib/trend-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const rawKeyword = new URL(request.url).searchParams.get('keyword') ?? '';
    const parsed = trendKeywordInput.safeParse(rawKeyword);
    if (!parsed.success) throw errors.validation('Keyword must be 2-120 characters.');
    return jsonResponse(await getTrends(parsed.data, clientId), 200, requestId);
  } catch (error) {
    safeLog('trends_read_error', { requestId, code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR' });
    return errorResponse(error, requestId);
  }
}
