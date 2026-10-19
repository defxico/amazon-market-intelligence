import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { getDataMode } from './env';
import { DispatchError, errors } from './errors';
import { safeLog } from './http';
import { permitRead, permitResearch } from './rate-limit';
import type { ResearchInput } from './schemas';
import { triggerResearchWorkflow } from './workflow-client';

const MAX_DISPATCH_ATTEMPTS = 8;

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function createResearch(input: ResearchInput, idempotencyKey: string | undefined, clientId: string) {
  if (!(await permitResearch(clientId))) throw errors.rateLimited();

  const db = getDb();
  let job = idempotencyKey
    ? await db.researchJob.findUnique({ where: { idempotencyKey } })
    : null;

  if (!job) {
    const { limit, ...jobInput } = input;
    const source = getDataMode();
    const sourceRightsProfile = source === 'serpapi' ? process.env.SERPAPI_RIGHTS_PROFILE?.trim() : null;
    if (source === 'serpapi' && (!sourceRightsProfile || sourceRightsProfile.length > 120)) {
      throw errors.dependencyUnavailable();
    }
    try {
      job = await db.$transaction(async (transaction) => {
        const created = await transaction.researchJob.create({
          data: {
            ...jobInput,
            requestedLimit: limit,
            source,
            searchRanking: source === 'serpapi' ? 'best_sellers' : 'featured',
            sourceRightsProfile,
            synthetic: source === 'fixture',
            workflowRunId: `research-${randomUUID()}`,
            idempotencyKey,
          },
        });
        await transaction.workflowOutbox.create({ data: { jobId: created.id } });
        return created;
      });
    } catch (error) {
      if (!idempotencyKey || !isUniqueConflict(error)) throw error;
      job = await db.researchJob.findUnique({ where: { idempotencyKey } });
      if (!job) throw error;
    }
  }

  const outbox = await db.workflowOutbox.findUnique({ where: { jobId: job.id } });
  if (outbox && outbox.status !== 'DISPATCHED' && outbox.status !== 'FAILED') {
    const dispatched = await dispatchOutboxEvent(outbox.id);
    if (!dispatched) throw new DispatchError(job.id);
  }
  return {
    jobId: job.id,
    status: job.status,
    statusUrl: `/api/research/${job.id}`,
  };
}

export async function dispatchOutboxEvent(outboxId: string): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const claimToken = randomUUID();
  const claim = await db.workflowOutbox.updateMany({
    where: {
      id: outboxId,
      OR: [
        { status: 'PENDING', nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: 'PROCESSING',
      claimToken,
      leaseUntil: new Date(now.getTime() + 60_000),
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  const event = await db.workflowOutbox.findUnique({
    where: { id: outboxId },
    include: { job: true },
  });
  if (!event) return false;
  if (claim.count === 0) return event.status === 'DISPATCHED';

  if (event.job.status === 'SUCCEEDED' || event.job.status === 'FAILED' || event.job.status === 'DISPATCH_FAILED') {
    await db.workflowOutbox.updateMany({
      where: { id: outboxId, claimToken },
      data: { status: 'DISPATCHED', dispatchedAt: new Date(), claimToken: null, leaseUntil: null },
    });
    return true;
  }

  try {
    if (!event.job.workflowRunId) throw new Error('Missing workflow run ID');
    await triggerResearchWorkflow(event.jobId, event.job.workflowRunId);
    await db.workflowOutbox.updateMany({
      where: { id: outboxId, status: 'PROCESSING', claimToken },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
        claimToken: null,
        leaseUntil: null,
        lastError: null,
      },
    });
    safeLog('workflow_dispatched', { jobId: event.jobId, outboxId, attempts: event.attempts });
    return true;
  } catch {
    const attempts = event.attempts;
    const permanentlyFailed = attempts >= MAX_DISPATCH_ATTEMPTS;
    const delayMs = Math.min(15 * 60_000, 30_000 * (2 ** Math.min(attempts - 1, 5)));
    await db.workflowOutbox.updateMany({
      where: { id: outboxId, status: 'PROCESSING', claimToken },
      data: {
        status: permanentlyFailed ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + delayMs),
        leaseUntil: null,
        claimToken: null,
        lastError: 'Workflow dispatch failed.',
      },
    });
    if (permanentlyFailed) {
      await db.researchJob.updateMany({
        where: { id: event.jobId, status: 'QUEUED' },
        data: { status: 'DISPATCH_FAILED', completedAt: new Date(), errorMessage: 'Workflow dispatch failed.' },
      });
    }
    safeLog('workflow_dispatch_failed', {
      jobId: event.jobId,
      outboxId,
      attempts,
      terminal: permanentlyFailed,
    });
    return false;
  }
}

export async function dispatchDueOutbox(limit = 25): Promise<{ found: number; dispatched: number }> {
  const db = getDb();
  const now = new Date();
  const events = await db.workflowOutbox.findMany({
    where: {
      OR: [
        { status: 'PENDING', nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', leaseUntil: { lt: now } },
      ],
    },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });
  let dispatched = 0;
  for (const event of events) {
    if (await dispatchOutboxEvent(event.id)) dispatched += 1;
  }
  return { found: events.length, dispatched };
}

export async function getResearch(jobId: string, clientId: string) {
  if (!(await permitRead(clientId))) throw errors.rateLimited();
  const job = await getDb().researchJob.findUnique({
    where: { id: jobId },
    include: {
      observations: {
        include: { product: true },
        orderBy: [{ position: { sort: 'asc', nulls: 'last' } }, { observedAt: 'asc' }],
      },
    },
  });
  if (!job) return null;
  return {
    jobId: job.id,
    keyword: job.keyword,
    marketplace: job.marketplace,
    page: job.page,
    requestedLimit: job.requestedLimit,
    status: job.status,
    synthetic: job.synthetic,
    source: job.source,
    searchRanking: job.searchRanking,
    sourceRightsProfile: job.sourceRightsProfile,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    error: job.status === 'FAILED' || job.status === 'DISPATCH_FAILED' ? job.errorMessage : null,
    products: job.observations.map((observation) => ({
      asin: observation.product.asin,
      title: observation.product.title,
      position: observation.position,
      price: observation.price?.toFixed(2) ?? null,
      currency: observation.currency,
      rating: observation.rating,
      reviewCount: observation.reviewCount,
      observedAt: observation.observedAt.toISOString(),
      evidenceUrl: observation.evidenceUrl,
    })),
  };
}
