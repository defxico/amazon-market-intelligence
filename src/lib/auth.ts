import { createHash, timingSafeEqual } from 'node:crypto';
import { errors } from './errors';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function verifyBearerToken(token: string | undefined): boolean {
  const expected = process.env.RESEARCH_API_KEY;
  if (!token || !expected || Buffer.byteLength(expected, 'utf8') < 32) return false;
  return timingSafeEqual(digest(token), digest(expected));
}

export function requireBearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  const token = match?.[1];
  if (!verifyBearerToken(token)) throw errors.unauthorized();
  return digest(token!).toString('hex').slice(0, 24);
}

export function verifyCronBearer(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  const token = match?.[1];
  if (!token || !expected || Buffer.byteLength(expected, 'utf8') < 32) return false;
  return timingSafeEqual(digest(token), digest(expected));
}
