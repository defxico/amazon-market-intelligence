import { z } from 'zod';
import { AppError } from './errors';

const providerCap = z.coerce.number().int().min(1).max(100_000);

export type DataMode = 'fixture' | 'serpapi';

export function getDataMode(): DataMode {
  const mode = process.env.DATA_MODE ?? 'fixture';
  if (mode !== 'fixture' && mode !== 'serpapi') {
    throw new AppError('INTERNAL_ERROR', 'Server data mode is misconfigured.', 500);
  }
  if (mode === 'serpapi') {
    const rightsProfile = process.env.SERPAPI_RIGHTS_PROFILE?.trim();
    if (!rightsProfile || rightsProfile.length > 120) {
      throw new AppError('DEPENDENCY_UNAVAILABLE', 'Live data use is not configured for this deployment.', 503);
    }
  }
  return mode;
}

export function getProviderCap(provider: 'serpapi' | 'firecrawl'): number {
  const name = provider === 'serpapi' ? 'MAX_SERPAPI_CALLS_PER_DAY' : 'MAX_FIRECRAWL_CALLS_PER_DAY';
  const fallback = provider === 'serpapi' ? '25' : '5';
  const parsed = providerCap.safeParse(process.env[name] ?? fallback);
  if (!parsed.success) throw new AppError('INTERNAL_ERROR', `${name} is invalid.`, 500);
  return parsed.data;
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AppError('DEPENDENCY_UNAVAILABLE', 'A required service is not configured.', 503);
  return value;
}

export function workflowConfig(): { baseUrl: string; token: string } {
  const developmentMode = process.env.QSTASH_DEV === 'true';
  if (process.env.NODE_ENV === 'production' && developmentMode) {
    throw new AppError('DEPENDENCY_UNAVAILABLE', 'Workflow configuration is unavailable.', 503);
  }
  const token = process.env.QSTASH_TOKEN?.trim() || (developmentMode ? 'dev' : '');
  if (!token) throw new AppError('DEPENDENCY_UNAVAILABLE', 'Workflow configuration is unavailable.', 503);
  const baseUrl = requiredEnv('APP_BASE_URL').replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AppError('INTERNAL_ERROR', 'APP_BASE_URL is invalid.', 500);
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(developmentMode && local)) {
    throw new AppError('INTERNAL_ERROR', 'APP_BASE_URL must use HTTPS in production.', 500);
  }
  if (!developmentMode && (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY)) {
    throw new AppError('DEPENDENCY_UNAVAILABLE', 'Workflow signature configuration is missing.', 503);
  }
  return { baseUrl, token };
}
