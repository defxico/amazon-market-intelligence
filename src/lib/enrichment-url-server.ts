import 'server-only';
import { isIP } from 'node:net';
import { validatePublicHttpsUrl } from './enrichment-url';

function approvedDomains(): string[] {
  return (process.env.APPROVED_ENRICHMENT_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^\.+|\.+$/g, ''))
    .filter((domain) => domain.length > 0 && !domain.includes('*') && !isIP(domain));
}

export function allowlistedRoot(hostname: string): string | null {
  return approvedDomains()
    .filter((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

export function validateEnrichmentUrl(raw: string): { url: URL; sourceHost: string } | null {
  const validated = validatePublicHttpsUrl(raw);
  if (!validated || !allowlistedRoot(validated.sourceHost)) return null;
  return validated;
}
