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

export type ManufacturerSearchOptions = {
  limit: 10;
  sources: ['web'];
  excludeDomains: string[];
};

export type ManufacturerSearchDiagnostics = {
  returned: number;
  rejectedInvalid: number;
  rejectedRetailOrSocial: number;
  rejectedThirdParty: number;
  rejectedBrandPage: number;
  rejectedCategory: number;
  rejectedNoB2BService: number;
  rejectedDuplicate: number;
  capped: number;
  saved: number;
};

export type ManufacturerCandidateDraft = {
  name: string;
  url: string;
  snippet: string;
  productBrief: string;
  contactUrl: null;
  capabilityStatus: 'SEARCH_EVIDENCE';
  source: 'firecrawl.search.manufacturer-v2';
  relationshipVerified: false;
};

type SavedManufacturerCandidate = {
  id: string;
  name: string;
  url: string;
  snippet: string;
  productBrief: string | null;
  contactUrl: string | null;
  capabilityStatus: string;
  source: string;
  relationshipVerified: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type SerializedCandidate = {
  id: string;
  name: string;
  title: string;
  url: string;
  snippet: string;
  productBrief: string | null;
  contactUrl: string | null;
  capabilityStatus: string;
  source: string;
  relationshipVerified: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

export const FIRECRAWL_SEARCH_EXCLUDED_DOMAINS = [
  'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.co.jp',
  'amazon.com.au', 'amazon.in', 'amazon.nl', 'amazon.com.br', 'amazon.com.mx',
  'walmart.com', 'target.com', 'ebay.com', 'etsy.com', 'temu.com', 'aliexpress.com',
  'reddit.com', 'youtube.com', 'facebook.com', 'instagram.com', 'pinterest.com', 'tiktok.com',
  'thomasnet.com', 'globalsources.com', 'made-in-china.com', 'kompass.com', 'europages.com', 'mfg.com',
];

const RETAIL_ROOTS = ['amazon.com', 'walmart.com', 'target.com', 'ebay.com', 'etsy.com', 'temu.com', 'aliexpress.com'];
const SOCIAL_ROOTS = ['reddit.com', 'youtube.com', 'facebook.com', 'instagram.com', 'pinterest.com', 'tiktok.com'];
const DIRECTORY_ROOTS = [
  'thomasnet.com', 'globalsources.com', 'made-in-china.com', 'kompass.com', 'europages.com',
  'mfg.com', 'industrynet.com', 'importyeti.com', 'alibaba.com',
];

const GENERIC_TERMS = new Set([
  'a', 'an', 'and', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with', 'your', 'our',
  'private', 'label', 'white', 'oem', 'odm', 'contract', 'manufacture', 'manufacturer', 'manufacturing',
  'copack', 'copacker', 'copacking', 'co', 'pack', 'packer', 'packing', 'make', 'made', 'produce',
  'production', 'product', 'products', 'similar', 'brand', 'brands', 'company', 'companies', 'service', 'services',
  'capacity', 'capabilities', 'custom', 'manufacturer', 'fabricante', 'fabricantes', 'fabricar', 'fabricacao',
  'marca', 'marcas', 'propria', 'proprio', 'terceiros', 'para', 'com', 'sem', 'uma', 'um', 'de', 'da', 'do', 'em',
]);

const B2B_MANUFACTURING_PATTERN = /\b(?:private[\s-]?label|white[\s-]?label|contract[\s-]?manufactur\w*|co[\s-]?manufactur\w*|co[\s-]?pack(?:er|ers|ing)?|custom\s+manufactur\w*|oem|odm|manufacturing\s+(?:services|capabilities)\s+for\s+(?:brands|customers)|manufactur\w*\s+for\s+(?:brands|customers|third[\s-]?parties)|toll\s+manufactur\w*)\b/i;
const RETAIL_EDITORIAL_PATTERN = /\b(?:buy|shop|sale|price|review|reviews|best\s+\d+|top\s+\d+|recipe|blog|news|reddit|youtube|wikipedia|marketplace|directory|supplier\s+directory|product\s+listing)\b/i;

export function calculateFirecrawlCreditsUsed(before: number | null, after: number | null): number | null {
  if (before === null || after === null || after > before) return null;
  return before - after;
}

function serializeCandidate(candidate: SavedManufacturerCandidate): SerializedCandidate {
  return {
    id: candidate.id,
    name: candidate.name,
    title: candidate.name,
    url: candidate.url,
    snippet: candidate.snippet,
    productBrief: candidate.productBrief,
    contactUrl: candidate.contactUrl,
    capabilityStatus: candidate.capabilityStatus,
    source: candidate.source,
    relationshipVerified: candidate.relationshipVerified,
    firstSeenAt: candidate.firstSeenAt.toISOString(),
    lastSeenAt: candidate.lastSeenAt.toISOString(),
  };
}

export function serializeSavedProductCandidates(product: {
  asin: string;
  title: string;
  latestSearch: { productBrief: string; requestId: string | null; diagnostics: unknown; status: string; searchedAt: Date } | null;
  candidates: SavedManufacturerCandidate[];
  previousCandidates: SavedManufacturerCandidate[];
  legacyCandidates: SavedManufacturerCandidate[];
}) {
  return {
    asin: product.asin,
    title: product.title,
    productBrief: product.latestSearch?.productBrief ?? null,
    providerUsageRequestId: product.latestSearch?.requestId ?? null,
    diagnostics: product.latestSearch?.diagnostics ?? null,
    searchStatus: product.latestSearch?.status ?? 'NONE',
    searchedAt: product.latestSearch?.searchedAt.toISOString() ?? null,
    candidates: product.candidates.slice(0, 5).map(serializeCandidate),
    previousCandidates: product.previousCandidates.slice(0, 5).map(serializeCandidate),
    legacyCandidates: product.legacyCandidates.slice(0, 5).map(serializeCandidate),
    warning: 'Search evidence does not confirm production capacity, quality, MOQ, availability, or a relationship to the Amazon brand.',
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

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeToken(value: string): string {
  let token = value;
  if (token.length > 4 && token.endsWith('ies')) token = `${token.slice(0, -3)}y`;
  else if (token.length > 3 && token.endsWith('s')) token = token.slice(0, -1);
  if (token === 'pistache') return 'pistachio';
  if (token === 'proteica' || token === 'proteico' || token === 'proteina') return 'protein';
  if (token === 'barra') return 'bar';
  return token;
}

function productCategoryTokens(productBrief: string): Set<string> {
  return new Set(normalizeText(productBrief).split(' ')
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !GENERIC_TERMS.has(token)));
}

function containsProductCategory(value: string, productBrief: string): boolean {
  const category = productCategoryTokens(productBrief);
  if (category.size === 0) return false;
  const observed = new Set(normalizeText(value).split(' ').map(normalizeToken));
  return [...category].some((token) => observed.has(token));
}

function hostIsUnder(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}

function isRetailOrSocial(hostname: string): boolean {
  return RETAIL_ROOTS.some((root) => hostIsUnder(hostname, root))
    || /(?:^|\.)amazon\.[a-z.]+$/i.test(hostname)
    || SOCIAL_ROOTS.some((root) => hostIsUnder(hostname, root));
}

function isDirectory(hostname: string): boolean {
  return DIRECTORY_ROOTS.some((root) => hostIsUnder(hostname, root));
}

function brandOwnsPage(brand: string | null, hostname: string): boolean {
  const normalizedBrand = normalizeText(cleanText(brand, 100));
  if (!normalizedBrand) return false;
  const normalizedHost = normalizeText(hostname);
  return normalizedHost.includes(normalizedBrand)
    || normalizedHost.replace(/\s/g, '').includes(normalizedBrand.replace(/\s/g, ''));
}

function hasThirdPartyManufacturingSignal(value: string): boolean {
  return B2B_MANUFACTURING_PATTERN.test(value);
}

function normalizeCompanyUrl(url: URL): string {
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

function emptyDiagnostics(returned: number): ManufacturerSearchDiagnostics {
  return {
    returned,
    rejectedInvalid: 0,
    rejectedRetailOrSocial: 0,
    rejectedThirdParty: 0,
    rejectedBrandPage: 0,
    rejectedCategory: 0,
    rejectedNoB2BService: 0,
    rejectedDuplicate: 0,
    capped: 0,
    saved: 0,
  };
}

export function manufacturerSearchQuery(product: SavedProductForDiscovery, productBrief: string): string {
  const category = normalizeManufacturerProductBrief(product, productBrief);
  return `private label contract manufacturer co-packer OEM ${category} made for other brands`.slice(0, 500);
}

export function normalizeManufacturerProductBrief(product: Pick<SavedProductForDiscovery, 'title' | 'brand'>, productBrief: string): string {
  const brand = cleanText(product.brand, 100);
  const normalizedBrief = cleanText(brand
    ? productBrief.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ')
    : productBrief, 160);
  if (!normalizedBrief || normalizedBrief.length < 8 || normalizedBrief.length > 160 || productCategoryTokens(normalizedBrief).size === 0) {
    throw errors.validation('Describe the product category to manufacture in 8 to 160 characters.');
  }
  return normalizedBrief;
}

export async function discoverManufacturerCandidates(
  product: SavedProductForDiscovery,
  productBrief: string,
  search: (query: string, options: ManufacturerSearchOptions) => Promise<unknown>,
): Promise<{ productBrief: string; leads: ManufacturerCandidateDraft[]; diagnostics: ManufacturerSearchDiagnostics }> {
  const normalizedBrief = normalizeManufacturerProductBrief(product, productBrief);
  if (!product.observations.some((observation) => !observation.synthetic && observation.status === 'SUCCEEDED')) {
    throw errors.validation('Manufacturer search requires a saved product with a successful non-synthetic observation.');
  }

  const response = await search(manufacturerSearchQuery(product, productBrief), {
    limit: 10,
    sources: ['web'],
    excludeDomains: FIRECRAWL_SEARCH_EXCLUDED_DOMAINS,
  });
  const webResults = typeof response === 'object' && response !== null && 'web' in response && Array.isArray(response.web)
    ? response.web.slice(0, 10)
    : [];
  const diagnostics = emptyDiagnostics(webResults.length);
  const urlsByHost = new Map<string, ManufacturerCandidateDraft>();

  for (const result of webResults) {
    if (typeof result !== 'object' || result === null) {
      diagnostics.rejectedInvalid++;
      continue;
    }
    const record = result as Record<string, unknown>;
    const validated = typeof record.url === 'string' ? validatePublicHttpsUrl(record.url) : null;
    const title = cleanText(record.title, 500);
    const snippet = cleanText(record.description, 2_000);
    if (!validated || !title || !snippet) {
      diagnostics.rejectedInvalid++;
      continue;
    }
    const hostname = validated.sourceHost.toLowerCase().replace(/^www\./, '');
    const searchableText = `${title} ${snippet} ${validated.url.pathname}`;
    if (isRetailOrSocial(hostname)) {
      diagnostics.rejectedRetailOrSocial++;
      continue;
    }
    if (isDirectory(hostname) || RETAIL_EDITORIAL_PATTERN.test(`${title} ${validated.url.pathname}`)) {
      diagnostics.rejectedThirdParty++;
      continue;
    }
    if (brandOwnsPage(product.brand, hostname)) {
      diagnostics.rejectedBrandPage++;
      continue;
    }
    if (!containsProductCategory(searchableText, normalizedBrief)) {
      diagnostics.rejectedCategory++;
      continue;
    }
    if (!hasThirdPartyManufacturingSignal(searchableText)) {
      diagnostics.rejectedNoB2BService++;
      continue;
    }
    if ([...urlsByHost.keys()].some((knownHost) => hostIsUnder(hostname, knownHost) || hostIsUnder(knownHost, hostname))) {
      diagnostics.rejectedDuplicate++;
      continue;
    }
    urlsByHost.set(hostname, {
      name: title,
      url: normalizeCompanyUrl(validated.url),
      snippet,
      productBrief: normalizedBrief,
      contactUrl: null,
      capabilityStatus: 'SEARCH_EVIDENCE',
      source: 'firecrawl.search.manufacturer-v2',
      relationshipVerified: false,
    });
  }

  const leads = [...urlsByHost.values()].slice(0, 5);
  diagnostics.capped = Math.max(0, urlsByHost.size - leads.length);
  diagnostics.saved = leads.length;
  return { productBrief: normalizedBrief, leads, diagnostics };
}

export function classifyManufacturerPageEvidence(text: string, productBrief: string): 'PAGE_EVIDENCE' | 'PAGE_NOT_CONFIRMED' {
  return containsProductCategory(text, productBrief) && hasThirdPartyManufacturingSignal(text)
    ? 'PAGE_EVIDENCE'
    : 'PAGE_NOT_CONFIRMED';
}
