import 'server-only';
import { createHash } from 'node:crypto';
import { Firecrawl } from 'firecrawl';
import { Prisma } from '../../generated/prisma/client';
import { getDb } from './db';
import {
  calculateFirecrawlCreditsUsed,
  discoverManufacturerCandidates,
  manufacturerSearchIsEnabled,
  normalizeManufacturerProductBrief,
  serializeSavedProductCandidates,
} from './manufacturer-discovery';
import { enrichApprovedUrl } from './enrichment';
import { AppError, errors } from './errors';
import { permitEnrichment, permitRead, reserveProviderCall } from './rate-limit';

const candidateFields = {
  id: true,
  name: true,
  url: true,
  snippet: true,
  productBrief: true,
  searchRequestId: true,
  contactUrl: true,
  capabilityStatus: true,
  source: true,
  relationshipVerified: true,
  firstSeenAt: true,
  lastSeenAt: true,
} as const;

export async function getSavedProductCandidates(asin: string, clientId: string) {
  if (!(await permitRead(clientId))) throw errors.rateLimited();

  const db = getDb();
  const product = await db.product.findUnique({
    where: { marketplace_asin: { marketplace: 'amazon.com', asin } },
    select: {
      id: true,
      asin: true,
      title: true,
      manufacturerSearchBrief: true,
      manufacturerSearchRequestId: true,
      manufacturerSearchDiagnostics: true,
      manufacturerSearchStatus: true,
      manufacturerSearchAt: true,
    },
  });
  if (!product) throw errors.notFound();

  const [candidates, previousCandidates, legacyCandidates] = await Promise.all([
    product.manufacturerSearchBrief && product.manufacturerSearchRequestId
      ? db.manufacturerCandidate.findMany({
        where: {
          productId: product.id,
          productBrief: product.manufacturerSearchBrief,
          searchRequestId: product.manufacturerSearchRequestId,
          capabilityStatus: { not: 'LEGACY' },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
        select: candidateFields,
      })
      : Promise.resolve([]),
    product.manufacturerSearchBrief
      ? db.manufacturerCandidate.findMany({
        where: {
          productId: product.id,
          productBrief: product.manufacturerSearchBrief,
          searchRequestId: { not: product.manufacturerSearchRequestId ?? '' },
          capabilityStatus: { not: 'LEGACY' },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
        select: candidateFields,
      })
      : Promise.resolve([]),
    db.manufacturerCandidate.findMany({
      where: { productId: product.id, capabilityStatus: 'LEGACY' },
      orderBy: { lastSeenAt: 'desc' },
      take: 5,
      select: candidateFields,
    }),
  ]);

  return serializeSavedProductCandidates({
    asin: product.asin,
    title: product.title,
    latestSearch: product.manufacturerSearchAt && product.manufacturerSearchBrief
      ? {
        productBrief: product.manufacturerSearchBrief,
        requestId: product.manufacturerSearchRequestId,
        diagnostics: product.manufacturerSearchDiagnostics,
        status: product.manufacturerSearchStatus,
        searchedAt: product.manufacturerSearchAt,
      }
      : null,
    candidates,
    previousCandidates,
    legacyCandidates,
  });
}

export async function searchSavedProductManufacturers(asin: string, productBrief: string, clientId: string) {
  if (!manufacturerSearchIsEnabled(process.env.FIRECRAWL_SEARCH_ENABLED)) throw errors.dependencyUnavailable();

  const db = getDb();
  const product = await db.product.findUnique({
    where: { marketplace_asin: { marketplace: 'amazon.com', asin } },
    include: {
      observations: {
        where: { job: { is: { synthetic: false, status: 'SUCCEEDED' } } },
        select: { job: { select: { synthetic: true, status: true } } },
        take: 1,
      },
    },
  });
  if (!product) throw errors.notFound();
  if (product.observations.length === 0) {
    throw errors.validation('Manufacturer search requires a saved product with a successful non-synthetic observation.');
  }
  const normalizedBrief = normalizeManufacturerProductBrief(product, productBrief);

  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  const rightsProfile = process.env.ENRICHMENT_RIGHTS_PROFILE?.trim();
  if (!apiKey || !rightsProfile || rightsProfile.length > 120) throw errors.dependencyUnavailable();
  if (!(await permitEnrichment(clientId))) throw errors.rateLimited();

  const requestId = await reserveProviderCall('firecrawl');
  await db.providerUsage.create({ data: { requestId, provider: 'firecrawl' } });
  await db.product.update({
    where: { id: product.id },
    data: {
      manufacturerSearchBrief: normalizedBrief,
      manufacturerSearchRequestId: requestId,
      manufacturerSearchDiagnostics: Prisma.DbNull,
      manufacturerSearchStatus: 'RUNNING',
      manufacturerSearchAt: new Date(),
    },
  });
  try {
    const firecrawl = new Firecrawl({ apiKey, timeoutMs: 40_000, maxRetries: 1 });
    let creditsBefore: number | null = null;
    try {
      creditsBefore = (await firecrawl.getCreditUsage()).remainingCredits;
    } catch {
      // Credit snapshots are optional; they must not prevent the search.
    }

    const result = await discoverManufacturerCandidates({
      id: product.id,
      asin: product.asin,
      marketplace: product.marketplace,
      title: product.title,
      brand: product.brand,
      observations: product.observations.map(({ job }) => ({
        synthetic: job.synthetic,
        status: job.status,
      })),
    }, normalizedBrief, async (query, options) => firecrawl.search(query, options));

    let creditsAfter: number | null = null;
    try {
      creditsAfter = (await firecrawl.getCreditUsage()).remainingCredits;
    } catch {
      // A completed search remains usable when Firecrawl usage is unavailable.
    }

    const saved = await db.$transaction(async (transaction) => {
      const persistedCandidates = [];
      for (const candidate of result.leads) {
        const urlHash = createHash('sha256').update(candidate.url).digest('hex');
        const previous = await transaction.manufacturerCandidate.findUnique({
          where: { productId_urlHash: { productId: product.id, urlHash } },
          select: { productBrief: true, capabilityStatus: true },
        });
        const capabilityStatus = previous?.productBrief === candidate.productBrief
          && previous.capabilityStatus === 'PAGE_EVIDENCE'
          ? 'PAGE_EVIDENCE'
          : candidate.capabilityStatus;
        const persisted = await transaction.manufacturerCandidate.upsert({
          where: { productId_urlHash: { productId: product.id, urlHash } },
          create: {
            productId: product.id,
            name: candidate.name,
            url: candidate.url,
            urlHash,
            snippet: candidate.snippet,
            productBrief: candidate.productBrief,
            searchRequestId: requestId,
            contactUrl: candidate.contactUrl,
            capabilityStatus,
            source: candidate.source,
            rightsProfile,
            relationshipVerified: false,
          },
          update: {
            name: candidate.name,
            url: candidate.url,
            snippet: candidate.snippet,
            productBrief: candidate.productBrief,
            searchRequestId: requestId,
            contactUrl: candidate.contactUrl,
            capabilityStatus,
            source: candidate.source,
            rightsProfile,
            lastSeenAt: new Date(),
            relationshipVerified: false,
          },
          select: candidateFields,
        });
        persistedCandidates.push(persisted);
      }

      await transaction.product.update({
        where: { id: product.id },
        data: {
          manufacturerSearchBrief: result.productBrief,
          manufacturerSearchRequestId: requestId,
          manufacturerSearchDiagnostics: result.diagnostics,
          manufacturerSearchStatus: 'SUCCEEDED',
          manufacturerSearchAt: new Date(),
        },
      });
      await transaction.providerUsage.update({
        where: { requestId },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
      const previousCandidates = await transaction.manufacturerCandidate.findMany({
        where: {
          productId: product.id,
          productBrief: result.productBrief,
          searchRequestId: { not: requestId },
          capabilityStatus: { not: 'LEGACY' },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
        select: candidateFields,
      });
      const legacyCandidates = await transaction.manufacturerCandidate.findMany({
        where: { productId: product.id, capabilityStatus: 'LEGACY' },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
        select: candidateFields,
      });
      return { candidates: persistedCandidates, previousCandidates, legacyCandidates };
    });

    return {
      asin: product.asin,
      productBrief: result.productBrief,
      candidates: saved.candidates,
      previousCandidates: saved.previousCandidates,
      legacyCandidates: saved.legacyCandidates,
      diagnostics: result.diagnostics,
      providerUsageRequestId: requestId,
      creditsUsed: calculateFirecrawlCreditsUsed(creditsBefore, creditsAfter),
      warning: 'Search evidence does not confirm production capacity, quality, MOQ, availability, or a relationship to the Amazon brand.',
      source: 'firecrawl.search.manufacturer-v2',
      rightsProfile,
    };
  } catch (error) {
    await db.$transaction([
      db.providerUsage.update({
        where: { requestId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorCode: error instanceof AppError ? 'VALIDATION_OR_PROVIDER_ERROR' : 'UPSTREAM_ERROR',
        },
      }),
      db.product.update({
        where: { id: product.id },
        data: { manufacturerSearchStatus: 'FAILED' },
      }),
    ]);
    throw error instanceof AppError ? error : errors.providerUnavailable();
  }
}

export async function enrichSavedManufacturerCandidate(candidateId: string) {
  const candidate = await getDb().manufacturerCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, productId: true, url: true, productBrief: true },
  });
  if (!candidate || !candidate.productBrief) throw errors.notFound();
  return enrichApprovedUrl(candidate.url, {
    candidateId: candidate.id,
    productId: candidate.productId,
    productBrief: candidate.productBrief,
  });
}
