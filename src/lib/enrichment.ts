import 'server-only';
import { isIP } from 'node:net';
import { Firecrawl } from 'firecrawl';
import { getDb } from './db';
import { AppError, errors } from './errors';
import { reserveProviderCall } from './rate-limit';

const MAX_EXCERPT_LENGTH = 4_000;

function approvedDomains(): string[] {
  return (process.env.APPROVED_ENRICHMENT_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter((domain) => domain.length > 0 && !domain.includes('*') && !isIP(domain));
}

function hostnameIsPublic(hostname: string): boolean {
  return !isIP(hostname)
    && hostname.includes('.')
    && hostname !== 'localhost'
    && !hostname.endsWith('.localhost')
    && !hostname.endsWith('.local')
    && !hostname.endsWith('.internal')
    && !hostname.endsWith('.test')
    && !hostname.endsWith('.invalid')
    && !hostname.endsWith('.onion');
}

export function validateEnrichmentUrl(raw: string): { url: URL; sourceHost: string } | null {
  if (raw.length > 2_048 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const allowed = approvedDomains();
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || !hostnameIsPublic(hostname)
      || !allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    ) return null;
    url.hash = '';
    return { url, sourceHost: hostname };
  } catch {
    return null;
  }
}

function allowlistedRoot(hostname: string): string | null {
  return approvedDomains()
    .filter((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

export async function enrichApprovedUrl(rawUrl: string) {
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
