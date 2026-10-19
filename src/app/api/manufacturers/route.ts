import { requireBearer } from '@/lib/auth';
import { errors } from '@/lib/errors';
import { errorResponse, getRequestId, jsonResponse, safeLog } from '@/lib/http';
import { getSavedProductCandidates } from '@/lib/manufacturer-discovery-service';
import { manufacturerSearchInput } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const asin = new URL(request.url).searchParams.get('asin');
    const parsed = manufacturerSearchInput.safeParse({ asin });
    if (!parsed.success) throw errors.validation('A valid saved Amazon ASIN is required.');

    return jsonResponse(await getSavedProductCandidates(parsed.data.asin, clientId), 200, requestId);
  } catch (error) {
    safeLog('manufacturer_candidates_read_error', {
      requestId,
      code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR',
    });
    return errorResponse(error, requestId);
  }
}
