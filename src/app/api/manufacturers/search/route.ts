import { requireBearer } from '@/lib/auth';
import { errorResponse, getRequestId, jsonResponse, readJson, safeLog } from '@/lib/http';
import { searchSavedProductManufacturers } from '@/lib/manufacturer-discovery-service';
import { manufacturerSearchInput } from '@/lib/schemas';
import { errors } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const parsed = manufacturerSearchInput.safeParse(await readJson(request, 8_192));
    if (!parsed.success) throw errors.validation('A valid saved Amazon ASIN and an 8–160-character product brief are required.');
    const result = await searchSavedProductManufacturers(parsed.data.asin, parsed.data.productBrief, clientId);
    return jsonResponse({ ...result, requestId }, 200, requestId);
  } catch (error) {
    safeLog('manufacturer_search_error', {
      requestId,
      code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR',
    });
    return errorResponse(error, requestId);
  }
}
