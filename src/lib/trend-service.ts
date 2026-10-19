import 'server-only';
import Decimal from 'decimal.js';
import { getDb } from './db';
import { errors } from './errors';
import { permitRead } from './rate-limit';

export async function getTrends(keyword: string, clientId: string) {
  if (!(await permitRead(clientId))) throw errors.rateLimited();
  const where = {
    keyword,
    marketplace: 'amazon.com',
    page: 1,
    requestedLimit: 10,
    status: 'SUCCEEDED' as const,
  };
  const db = getDb();
  const jobs = await db.researchJob.findMany({
    where,
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: { observations: { include: { product: true } } },
  });
  if (jobs[0]?.synthetic) {
    return {
      keyword,
      status: 'insufficient_history' as const,
      historyCount: jobs.length,
      methodologyVersion: 'rank_proxy_v1',
      confidence: 'low' as const,
      source: jobs[0].source,
      synthetic: true,
      comparisonWindow: null,
      signals: [],
      note: 'Synthetic fixture snapshots cannot support trend comparisons. Enable approved real data collection to compare real snapshots.',
    };
  }
  if (jobs.length < 2) {
    return {
      keyword,
      status: 'insufficient_history' as const,
      historyCount: jobs.length,
      methodologyVersion: 'rank_proxy_v1',
      confidence: 'low' as const,
      comparisonWindow: null,
      signals: [],
      note: 'A second compatible successful snapshot is required. These observations do not measure sales or demand.',
    };
  }

  const current = jobs[0];
  const compatible = jobs.filter((job) =>
    job.source === current.source
    && job.marketplace === current.marketplace
    && job.page === current.page
    && job.requestedLimit === current.requestedLimit,
  );
  if (compatible.length < 2) {
    return {
      keyword,
      status: 'insufficient_history' as const,
      historyCount: 1,
      methodologyVersion: 'rank_proxy_v1',
      confidence: 'low' as const,
      comparisonWindow: null,
      signals: [],
      note: 'The latest snapshot has no earlier result from the same provider and search settings.',
    };
  }

  const [latest, previous] = compatible;
  const latestAt = latest.completedAt ?? latest.createdAt;
  const previousAt = previous.completedAt ?? previous.createdAt;
  const elapsedSeconds = Math.max(0, Math.floor((latestAt.getTime() - previousAt.getTime()) / 1000));
  const earlierAt = compatible.at(-1)?.completedAt ?? compatible.at(-1)?.createdAt ?? previousAt;
  const spanDays = (latestAt.getTime() - earlierAt.getTime()) / 86_400_000;
  const confidence = compatible.length >= 3 && spanDays >= 7 ? 'limited' : 'low';

  const previousByAsin = new Map(previous.observations.map((row) => [row.product.asin, row]));
  const latestByAsin = new Map(latest.observations.map((row) => [row.product.asin, row]));
  const signals = [] as Array<Record<string, string | number | null>>;

  for (const row of latest.observations) {
    const before = previousByAsin.get(row.product.asin);
    if (!before) {
      signals.push({ asin: row.product.asin, status: 'not_in_previous_sample', rankImprovement: null, priceChangePercent: null, reviewDelta: null });
      continue;
    }
    const priceChangePercent = before.price && row.price && before.price.greaterThan(0)
      ? new Decimal(row.price.toString())
        .minus(before.price.toString())
        .dividedBy(before.price.toString())
        .times(100)
        .toDecimalPlaces(2)
        .toNumber()
      : null;
    signals.push({
      asin: row.product.asin,
      status: 'observed_in_both_samples',
      rankImprovement: before.position !== null && row.position !== null ? before.position - row.position : null,
      priceChangePercent,
      reviewDelta: before.reviewCount !== null && row.reviewCount !== null ? row.reviewCount - before.reviewCount : null,
    });
  }

  for (const row of previous.observations) {
    if (!latestByAsin.has(row.product.asin)) {
      signals.push({ asin: row.product.asin, status: 'not_observed_in_latest_sample', rankImprovement: null, priceChangePercent: null, reviewDelta: null });
    }
  }

  return {
    keyword,
    status: 'directional_only' as const,
    historyCount: await db.researchJob.count({ where: { ...where, source: current.source } }),
    methodologyVersion: 'rank_proxy_v1',
    confidence,
    source: latest.source,
    synthetic: latest.synthetic || previous.synthetic,
    comparisonWindow: {
      from: previousAt.toISOString(),
      to: latestAt.toISOString(),
      elapsedSeconds,
      totalSpanDays: Number(spanDays.toFixed(2)),
    },
    signals,
    note: 'Search rank, price and review changes are sample observations, not verified unit sales, revenue, demand or market share.',
  };
}
