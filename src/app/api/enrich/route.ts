import { requireBearer } from '@/lib/auth';
import { enrichApprovedUrl } from '@/lib/enrichment';
import { errors } from '@/lib/errors';
import { errorResponse, getRequestId, jsonResponse, readJson, safeLog } from '@/lib/http';
import { enrichSavedManufacturerCandidate } from '@/lib/manufacturer-discovery-service';
import { permitEnrichment } from '@/lib/rate-limit';
import { enrichmentInput } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const parsed = enrichmentInput.safeParse(await readJson(request, 8_192));
    if (!parsed.success) throw errors.validation('A single HTTPS URL or saved candidate ID is required.');
    if (!(await permitEnrichment(clientId))) throw errors.rateLimited();
    const result = 'candidateId' in parsed.data
      ? await enrichSavedManufacturerCandidate(parsed.data.candidateId)
      : await enrichApprovedUrl(parsed.data.url);
    return jsonResponse(result, 200, requestId);
  } catch (error) {
    safeLog('enrichment_error', {
      requestId,
      code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR',
    });
    return errorResponse(error, requestId);
  }
}
