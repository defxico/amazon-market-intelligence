import { requireBearer } from '@/lib/auth';
import { errors } from '@/lib/errors';
import { errorResponse, getRequestId, jsonResponse, safeLog } from '@/lib/http';
import { jobIdInput } from '@/lib/schemas';
import { getResearch } from '@/lib/research-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);
  try {
    const clientId = requireBearer(request);
    const { id } = await context.params;
    if (!jobIdInput.safeParse(id).success) throw errors.validation('The job ID is invalid.');
    const research = await getResearch(id, clientId);
    if (!research) throw errors.notFound();
    return jsonResponse(research, 200, requestId);
  } catch (error) {
    if (!(error instanceof Error && 'status' in error && error.status === 401)) {
      safeLog('research_read_error', { requestId, code: error instanceof Error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR' });
    }
    return errorResponse(error, requestId);
  }
}
