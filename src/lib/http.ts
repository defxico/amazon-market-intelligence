import { randomUUID } from 'node:crypto';
import { AppError } from './errors';

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Authorization',
};

export function getRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  if (incoming && /^[a-zA-Z0-9._:-]{1,100}$/.test(incoming)) return incoming;
  return randomUUID();
}

export function jsonResponse<T>(data: T, status = 200, requestId?: string): Response {
  const headers = new Headers(PRIVATE_HEADERS);
  if (requestId) headers.set('X-Request-Id', requestId);
  return Response.json(data, { status, headers });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const appError = error instanceof AppError
    ? error
    : new AppError('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  return jsonResponse({
    error: { code: appError.code, message: appError.message },
    requestId,
  }, appError.status, requestId);
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new AppError('VALIDATION_ERROR', 'Content-Type must be application/json.', 415);
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError('VALIDATION_ERROR', 'Request body is too large.', 413);
  }
  if (!request.body) throw new AppError('VALIDATION_ERROR', 'A JSON request body is required.', 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError('VALIDATION_ERROR', 'Request body is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must contain valid JSON.', 400);
  }
}

export function safeLog(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.info(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
