import 'server-only';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { getProviderCap } from './env';
import { AppError, errors } from './errors';

let redisClient: Redis | undefined;

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw errors.dependencyUnavailable();
  redisClient = new Redis({ url, token, automaticDeserialization: false });
  return redisClient;
}

const slidingWindowScript = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
local nowMs = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowStart = math.floor(nowMs / windowMs) * windowMs
local elapsed = nowMs - windowStart
local weighted = previous * ((windowMs - elapsed) / windowMs) + current
if weighted >= limit then
  return {0, windowStart + windowMs}
end
current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], windowMs * 2) end
if previous > 0 and redis.call('PTTL', KEYS[2]) < 0 then redis.call('PEXPIRE', KEYS[2], windowMs) end
return {1, windowStart + windowMs}
`;

const reserveBudgetScript = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if count >= limit then return 0 end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
return count
`;

async function takeSlidingWindow(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const currentKey = `${key}:${window}`;
    const previousKey = `${key}:${window - 1}`;
    const result = await redis.eval<[number, number, number], number[]>(slidingWindowScript, [currentKey, previousKey], [now, windowMs, limit]);
    return Array.isArray(result) && Number(result[0]) === 1;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.dependencyUnavailable();
  }
}

export async function permitResearch(clientId: string): Promise<boolean> {
  return takeSlidingWindow(`ami:rate:research:${clientId}`, 10, 60_000);
}

export async function permitRead(clientId: string): Promise<boolean> {
  return takeSlidingWindow(`ami:rate:read:${clientId}`, 60, 60_000);
}

export async function permitEnrichment(clientId: string): Promise<boolean> {
  return takeSlidingWindow(`ami:rate:enrichment:${clientId}`, 5, 60 * 60_000);
}

export async function reserveProviderCall(provider: 'serpapi' | 'firecrawl'): Promise<string> {
  try {
    const redis = getRedis();
    const day = new Date().toISOString().slice(0, 10);
    const cap = getProviderCap(provider);
    const result = await redis.eval<[number], number>(
      reserveBudgetScript,
      [`ami:budget:${provider}:${day}`],
      [cap],
    );
    if (Number(result) === 0) throw errors.budgetExhausted(provider);
    return randomUUID();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.dependencyUnavailable();
  }
}
