import 'server-only';
import { createHash } from 'node:crypto';
import { Firecrawl } from 'firecrawl';
import { getDb } from './db';
import { discoverManufacturerCandidates, manufacturerSearchIsEnabled } from './manufacturer-discovery';
import { enrichApprovedUrl } from './enrichment';
import { AppError, errors } from './errors';
import { reserveProviderCall } from './rate-limit';

export async function searchSavedProductManufacturers(asin: string) {
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

  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  const rightsProfile = process.env.ENRICHMENT_RIGHTS_PROFILE?.trim();
  if (!apiKey || !rightsProfile || rightsProfile.length > 120) throw errors.dependencyUnavailable();

  const requestId = await reserveProviderCall('firecrawl');
  await db.providerUsage.create({ data: { requestId, provider: 'firecrawl' } });
  try {
    const firecrawl = new Firecrawl({ apiKey, timeoutMs: 40_000, maxRetries: 1 });
    const candidates = await discoverManufacturerCandidates({
      id: product.id,
      asin: product.asin,
      marketplace: product.marketplace,
      title: product.title,
      brand: product.brand,
      observations: product.observations.map(({ job }) => ({
        synthetic: job.synthetic,
        status: job.status,
      })),
    }, async (query, options) => firecrawl.search(query, options));

    const saved = await db.$transaction(async (transaction) => {
      const result = [];
      for (const candidate of candidates) {
        const urlHash = createHash('sha256').update(candidate.url).digest('hex');
        const persisted = await transaction.manufacturerCandidate.upsert({
          where: { productId_urlHash: { productId: product.id, urlHash } },
          create: {
            productId: product.id,
            name: candidate.name,
            url: candidate.url,
            urlHash,
            snippet: candidate.snippet,
            source: candidate.source,
            rightsProfile,
            relationshipVerified: false,
          },
          update: {
            name: candidate.name,
            url: candidate.url,
            snippet: candidate.snippet,
            source: candidate.source,
            rightsProfile,
            lastSeenAt: new Date(),
            relationshipVerified: false,
          },
          select: { id: true, name: true, url: true, snippet: true, source: true, relationshipVerified: true },
        });
        result.push({ ...persisted, sourceUrl: persisted.url });
      }
      await transaction.providerUsage.update({
        where: { requestId },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
      return result;
    });

    return {
      asin: product.asin,
      candidates: saved,
      warning: 'Candidate names are search-result titles. Search results and site text do not verify who manufactures this product or ASIN.',
      source: 'firecrawl.search',
      rightsProfile,
    };
  } catch (error) {
    await db.providerUsage.update({
      where: { requestId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode: error instanceof AppError ? 'VALIDATION_OR_PROVIDER_ERROR' : 'UPSTREAM_ERROR',
      },
    });
    throw error instanceof AppError ? error : errors.providerUnavailable();
  }
}

export async function enrichSavedManufacturerCandidate(candidateId: string) {
  const candidate = await getDb().manufacturerCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, productId: true, url: true },
  });
  if (!candidate) throw errors.notFound();
  return enrichApprovedUrl(candidate.url, {
    candidateId: candidate.id,
    productId: candidate.productId,
  });
}
