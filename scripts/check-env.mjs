const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
if (!production) await import('dotenv/config');

const issues = [];
const required = [
  'DATABASE_URL',
  'RESEARCH_API_KEY',
  'CRON_SECRET',
  'APP_BASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

for (const name of required) {
  if (!process.env[name]?.trim()) issues.push(`${name} is missing`);
}

for (const name of ['RESEARCH_API_KEY', 'CRON_SECRET']) {
  if (process.env[name] && Buffer.byteLength(process.env[name], 'utf8') < 32) {
    issues.push(`${name} must contain at least 32 bytes`);
  }
}

for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = process.env[name];
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') issues.push(`${name} must be a PostgreSQL URL`);
  } catch {
    issues.push(`${name} must be a valid URL`);
  }
}

if (process.env.RESEARCH_API_KEY && process.env.CRON_SECRET
  && process.env.RESEARCH_API_KEY === process.env.CRON_SECRET) {
  issues.push('RESEARCH_API_KEY and CRON_SECRET must be different values');
}

if (process.env.APP_BASE_URL) {
  try {
    const url = new URL(process.env.APP_BASE_URL);
    const localHost = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(!production && localHost)) {
      issues.push('APP_BASE_URL must use HTTPS outside local development');
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      issues.push('APP_BASE_URL must be an origin without credentials, path, query, or fragment');
    }
  } catch {
    issues.push('APP_BASE_URL must be a valid URL');
  }
}

if (process.env.UPSTASH_REDIS_REST_URL) {
  try {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      issues.push('UPSTASH_REDIS_REST_URL must be an HTTPS endpoint without embedded credentials or fragment');
    }
  } catch {
    issues.push('UPSTASH_REDIS_REST_URL must be a valid URL');
  }
}

const mode = process.env.DATA_MODE ?? 'fixture';
if (!['fixture', 'serpapi'].includes(mode)) issues.push('DATA_MODE must be fixture or serpapi');
if (mode === 'serpapi' && !process.env.SERPAPI_API_KEY?.trim()) issues.push('SERPAPI_API_KEY is required when DATA_MODE=serpapi');
if (mode === 'serpapi' && !process.env.SERPAPI_RIGHTS_PROFILE?.trim()) issues.push('SERPAPI_RIGHTS_PROFILE is required when DATA_MODE=serpapi');

if (production) {
  for (const name of ['QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']) {
    if (!process.env[name]?.trim()) issues.push(`${name} is required in production`);
  }
  if (process.env.QSTASH_DEV === 'true') issues.push('QSTASH_DEV must not be true in production');
}

const enrichmentEnabled = Boolean(process.env.FIRECRAWL_API_KEY?.trim());
if (enrichmentEnabled) {
  if (!process.env.ENRICHMENT_RIGHTS_PROFILE?.trim()) issues.push('ENRICHMENT_RIGHTS_PROFILE is required when Firecrawl is enabled');
}

if (process.env.FIRECRAWL_SEARCH_ENABLED !== undefined
  && !['true', 'false'].includes(process.env.FIRECRAWL_SEARCH_ENABLED)) {
  issues.push('FIRECRAWL_SEARCH_ENABLED must be true or false');
}
if (process.env.FIRECRAWL_SEARCH_ENABLED === 'true' && !enrichmentEnabled) {
  issues.push('FIRECRAWL_API_KEY is required when Firecrawl search is enabled');
}
if (process.env.FIRECRAWL_SEARCH_ENABLED === 'true' && !process.env.ENRICHMENT_RIGHTS_PROFILE?.trim()) {
  issues.push('ENRICHMENT_RIGHTS_PROFILE is required when Firecrawl search is enabled');
}

for (const [name, fallback, maximum, minimum] of [
  ['MAX_SERPAPI_CALLS_PER_DAY', '25', 100_000, 1],
  ['MAX_FIRECRAWL_CALLS_PER_DAY', '5', 100_000, 1],
  ['OBSERVATION_RETENTION_DAYS', '30', 3_650, 1],
  ['USAGE_RETENTION_DAYS', '365', 3_650, 30],
]) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) issues.push(`${name} must be an integer from ${minimum} to ${maximum}`);
}

if (issues.length > 0) {
  console.error('Environment check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Environment check passed (${mode} mode). No secret values were printed.`);
