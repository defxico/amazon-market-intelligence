import 'server-only';
import { getDb } from './db';
import { requiredEnv } from './env';
import { AppError, errors } from './errors';
import { reserveProviderCall } from './rate-limit';

export type Listing = {
  asin: string;
  title: string;
  position: number | null;
  price: string | null;
  rating: number | null;
  reviewCount: number | null;
  currency: 'USD';
  evidenceUrl: string;
};

type SearchInput = { keyword: string; marketplace: 'amazon.com'; page: number; limit: number };

const fixtureListings: Listing[] = [
  { asin: 'B000000001', title: 'Synthetic Compact Blender One', position: 1, price: '24.99', rating: 4.2, reviewCount: 120, currency: 'USD', evidenceUrl: 'https://www.amazon.com/dp/B000000001' },
  { asin: 'B000000002', title: 'Synthetic Portable Blender Two', position: 2, price: '34.50', rating: 4.4, reviewCount: 87, currency: 'USD', evidenceUrl: 'https://www.amazon.com/dp/B000000002' },
  { asin: 'B000000003', title: 'Synthetic Travel Blender Three', position: 3, price: null, rating: null, reviewCount: null, currency: 'USD', evidenceUrl: 'https://www.amazon.com/dp/B000000003' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function normalizePrice(item: Record<string, unknown>): string | null {
  const nested = isRecord(item.price) ? item.price : undefined;
  const value = finiteNumber(item.extracted_price, 0, 1_000_000_000)
    ?? finiteNumber(nested?.extracted_value, 0, 1_000_000_000)
    ?? finiteNumber(nested?.value, 0, 1_000_000_000);
  return value === null ? null : value.toFixed(2);
}

function normalizeListing(value: unknown): Listing | null {
  if (!isRecord(value)) return null;
  const resultType = typeof value.type === 'string' ? value.type.toLowerCase() : '';
  if (value.sponsored === true || value.sponsored === 'true' || /sponsored|advertisement/.test(resultType)) return null;
  const asin = typeof value.asin === 'string' ? value.asin.trim().toUpperCase() : '';
  const title = typeof value.title === 'string'
    ? value.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
    : '';
  if (!/^[A-Z0-9]{10}$/.test(asin) || !title) return null;
  const providerPosition = finiteNumber(value.position, 1, 500);
  const rating = finiteNumber(value.rating, 0, 5);
  const reviewCount = finiteNumber(value.reviews, 0, 100_000_000);
  return {
    asin,
    title,
    position: providerPosition !== null && Number.isInteger(providerPosition) ? providerPosition : null,
    price: normalizePrice(value),
    rating,
    reviewCount: reviewCount !== null && Number.isInteger(reviewCount) ? reviewCount : null,
    currency: 'USD',
    evidenceUrl: `https://www.amazon.com/dp/${asin}`,
  };
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw errors.providerUnavailable();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw errors.providerUnavailable();
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
    throw errors.providerUnavailable();
  }
}

async function markUsage(requestId: string, succeeded: boolean, errorCode?: string): Promise<void> {
  await getDb().providerUsage.update({
    where: { requestId },
    data: {
      status: succeeded ? 'SUCCEEDED' : 'FAILED',
      completedAt: new Date(),
      errorCode: errorCode ?? null,
    },
  });
}

export async function fetchListings(input: SearchInput, source: string, jobId: string): Promise<Listing[]> {
  if (source === 'fixture') {
    const keyword = input.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
    if ((keyword !== 'blender' && keyword !== 'portable blender') || input.page !== 1) return [];
    return fixtureListings.slice(0, input.limit);
  }
  if (source !== 'serpapi') throw new AppError('INTERNAL_ERROR', 'The saved provider is invalid.', 500);

  const apiKey = requiredEnv('SERPAPI_API_KEY');
  const requestId = await reserveProviderCall('serpapi');
  await getDb().providerUsage.create({ data: { requestId, provider: 'serpapi', jobId } });
  try {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'amazon');
    url.searchParams.set('amazon_domain', input.marketplace);
    url.searchParams.set('k', input.keyword);
    url.searchParams.set('page', String(input.page));
    url.searchParams.set('api_key', apiKey);
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw errors.providerUnavailable();
    const raw = await boundedJson(response, 2_000_000);
    if (!isRecord(raw) || typeof raw.error === 'string' || !Array.isArray(raw.organic_results)) {
      throw errors.providerUnavailable();
    }
    const listings: Listing[] = [];
    for (const value of raw.organic_results) {
      const listing = normalizeListing(value);
      if (listing) listings.push(listing);
      if (listings.length >= input.limit) break;
    }
    await markUsage(requestId, true);
    return listings;
  } catch (error) {
    await markUsage(requestId, false, error instanceof AppError ? error.code : 'UPSTREAM_ERROR');
    throw error instanceof AppError ? error : errors.providerUnavailable();
  }
}
