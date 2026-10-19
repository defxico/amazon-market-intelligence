import { isIP } from 'node:net';

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

export function validatePublicHttpsUrl(raw: string): { url: URL; sourceHost: string } | null {
  if (raw.length > 2_048 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || !hostnameIsPublic(hostname)
    ) return null;
    url.hash = '';
    return { url, sourceHost: hostname };
  } catch {
    return null;
  }
}
