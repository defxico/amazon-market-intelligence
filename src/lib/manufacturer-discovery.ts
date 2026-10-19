import { errors } from './errors';
import { validatePublicHttpsUrl } from './enrichment-url';

export type SavedProductForDiscovery = {
  id: string;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  observations: Array<{ synthetic: boolean; status: string }>;
};

export type ManufacturerSearchOptions = { limit: 5; sources: ['web'] };
export type ManufacturerCandidateDraft = {
  name: string;
  url: string;
  snippet: string;
  source: 'firecrawl.search.manufacturer-v1';
  relationshipVerified: false;
};

type SavedManufacturerCandidate = {
  id: string;
  name: string;
  url: string;
  snippet: string;
  source: string;
  relationshipVerified: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export function calculateFirecrawlCreditsUsed(before: number | null, after: number | null): number | null {
  if (before === null || after === null || after > before) return null;
  return before - after;
}

export function serializeSavedProductCandidates(product: {
  asin: string;
  title: string;
  candidates: SavedManufacturerCandidate[];
}) {
  return {
    asin: product.asin,
    title: product.title,
    candidates: product.candidates.slice(0, 5).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      title: candidate.name,
      url: candidate.url,
      snippet: candidate.snippet,
      source: candidate.source,
      relationshipVerified: candidate.relationshipVerified,
      firstSeenAt: candidate.firstSeenAt.toISOString(),
      lastSeenAt: candidate.lastSeenAt.toISOString(),
    })),
    warning: 'Search-result pages mention manufacturing capabilities; company identity and product fit are unverified.',
  };
}

function cleanText(value: unknown, maximum: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : '';
}

export function manufacturerSearchIsEnabled(value: string | undefined): boolean {
  return value === 'true';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function productDescription(product: SavedProductForDiscovery): string {
  let title = cleanText(product.title, 350);
  const brand = cleanText(product.brand, 100);
  if (brand) title = title.replace(new RegExp(escapeRegExp(brand), 'ig'), ' ');
  if (product.asin) title = title.replace(new RegExp(escapeRegExp(product.asin), 'ig'), ' ');
  return cleanText(title, 350) || 'a similar product';
}

export function manufacturerSearchQuery(product: SavedProductForDiscovery): string {
  return `Find private label, OEM, or contract manufacturers capable of making products similar to ${productDescription(product)}`.slice(0, 500);
}

const RETAIL_DOMAINS = ['walmart.com', 'target.com', 'ebay.com', 'etsy.com', 'temu.com', 'aliexpress.com'];

function isRetailResult(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return /(^|\.)amazon\.[a-z.]+$/.test(hostname)
    || RETAIL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function advertisesManufacturingCapacity(name: string, url: string, snippet: string): boolean {
  return /\b(?:private[-\s]label|white[-\s]label|contract[-\s]manufactur(?:er|ing)|co[-\s]?(?:manufactur(?:er|ing)|pack(?:er|ing))|OEM|ODM|manufacturing\s+(?:services|capabilities)|custom\s+manufacturing|manufactur(?:e|es|ing)\s+(?:products?\s+for\s+(?:brands?|customers?)|for\s+(?:brands?|customers?)))\b/i
    .test(`${name} ${url} ${snippet}`);
}

export async function discoverManufacturerCandidates(
  product: SavedProductForDiscovery,
  search: (query: string, options: ManufacturerSearchOptions) => Promise<unknown>,
): Promise<ManufacturerCandidateDraft[]> {
  if (
    !product.observations.some((observation) => !observation.synthetic && observation.status === 'SUCCEEDED')
  ) throw errors.validation('Manufacturer search requires a saved product with a successful non-synthetic observation.');

  const response = await search(manufacturerSearchQuery(product), { limit: 5, sources: ['web'] });
  if (typeof response !== 'object' || response === null || !('web' in response) || !Array.isArray(response.web)) {
    return [];
  }

  const uniqueUrls = new Set<string>();
  const candidates: ManufacturerCandidateDraft[] = [];
  for (const result of response.web.slice(0, 5)) {
    if (typeof result !== 'object' || result === null) continue;
    const record = result as Record<string, unknown>;
    const validated = typeof record.url === 'string' ? validatePublicHttpsUrl(record.url) : null;
    const name = cleanText(record.title, 500);
    const snippet = cleanText(record.description, 2_000);
    if (!validated || !name || !snippet) continue;
    const url = validated.url.toString();
    if (isRetailResult(url) || !advertisesManufacturingCapacity(name, url, snippet)) continue;
    if (uniqueUrls.has(url)) continue;
    uniqueUrls.add(url);
    candidates.push({
      name,
      url,
      snippet,
      source: 'firecrawl.search.manufacturer-v1',
      relationshipVerified: false,
    });
  }
  return candidates;
}
