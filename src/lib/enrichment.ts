import 'server-only';
import { Firecrawl } from 'firecrawl';
import { getDb } from './db';
import { validateEnrichmentUrl, allowlistedRoot } from './enrichment-url-server';
import { AppError, errors } from './errors';
import { reserveProviderCall } from './rate-limit';

const MAX_EXCERPT_LENGTH = 4_000;

export async function enrichApprovedUrl(
  rawUrl: string,
  association?: { productId: string; candidateId: string },
) {
  const validated = validateEnrichmentUrl(rawUrl);
  if (!validated) throw errors.validation('The HTTPS domain is not approved for enrichment.');
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const rightsProfile = process.env.ENRICHMENT_RIGHTS_PROFILE?.trim();
  if (!apiKey || !rightsProfile || rightsProfile.length > 120) {
    throw errors.dependencyUnavailable();
  }

  const requestId = await reserveProviderCall('firecrawl');
  await getDb().providerUsage.create({ data: { requestId, provider: 'firecrawl' } });
  try {
    const firecrawl = new Firecrawl({ apiKey, timeoutMs: 40_000, maxRetries: 0 });
    const result = await firecrawl.scrape(validated.url.toString(), {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 35_000,
      maxAge: 0,
      autoResume: false,
      removeBase64Images: true,
    });
    const finalUrl = result.metadata?.sourceURL;
    const final = typeof finalUrl === 'string' ? validateEnrichmentUrl(finalUrl) : null;
    if (!final || allowlistedRoot(final.sourceHost) !== allowlistedRoot(validated.sourceHost)) {
      throw errors.providerUnavailable();
    }
    const markdown = typeof result.markdown === 'string'
      ? result.markdown.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
      : '';
    const excerpt = markdown.slice(0, MAX_EXCERPT_LENGTH);
    const retrievedAt = new Date();
    const evidence = await getDb().$transaction(async (transaction) => {
      const saved = await transaction.enrichmentEvidence.create({
        data: {
          sourceHost: final.sourceHost,
          sourceUrl: final.url.toString().slice(0, 2_048),
          retrievedAt,
          excerpt,
          rightsProfile,
          ...(association ?? {}),
        },
        select: { id: true },
      });
      await transaction.providerUsage.update({
        where: { requestId },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
      return saved;
    });
    return {
      evidenceId: evidence.id,
      url: final.url.toString(),
      sourceHost: final.sourceHost,
      source: 'firecrawl',
      retrievedAt: retrievedAt.toISOString(),
      rightsProfile,
      excerpt,
      truncated: markdown.length > MAX_EXCERPT_LENGTH,
    };
  } catch (error) {
    await getDb().providerUsage.update({
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
