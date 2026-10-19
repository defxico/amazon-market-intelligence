import { serve } from '@upstash/workflow/nextjs';
import { getDb } from '@/lib/db';
import { safeLog } from '@/lib/http';
import { fetchListings } from '@/lib/provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

type WorkflowPayload = { jobId: string; workflowRunId: string };

export const { POST } = serve<WorkflowPayload>(
  async (context) => {
    const payload = context.requestPayload;
    const job = await context.run('claim-research-job-v1', async () => {
      const db = getDb();
      const found = await db.researchJob.findUnique({ where: { id: payload.jobId } });
      if (!found || found.workflowRunId !== payload.workflowRunId) return null;
      if (found.status === 'SUCCEEDED' || found.status === 'FAILED' || found.status === 'DISPATCH_FAILED') return null;

      if (found.status === 'QUEUED') {
        const claimed = await db.researchJob.updateMany({
          where: { id: found.id, status: 'QUEUED', workflowRunId: payload.workflowRunId },
          data: { status: 'RUNNING', startedAt: new Date() },
        });
        if (claimed.count !== 1) return null;
      }
      return {
        id: found.id,
        keyword: found.keyword,
        marketplace: found.marketplace as 'amazon.com',
        page: found.page,
        limit: found.requestedLimit,
        source: found.source,
        ranking: found.searchRanking,
        workflowRunId: found.workflowRunId,
      };
    });
    if (!job) return;

    const listings = await context.run('fetch-listings-v1', async () =>
      fetchListings({
        keyword: job.keyword,
        marketplace: job.marketplace,
        page: job.page,
        limit: job.limit,
        ranking: job.ranking === 'best_sellers' ? 'best_sellers' : 'featured',
      }, job.source, job.id),
    );

    await context.run('persist-observations-and-complete-v1', async () => {
      const db = getDb();
      await db.$transaction(async (transaction) => {
        const current = await transaction.researchJob.findUnique({ where: { id: job.id } });
        if (!current || current.workflowRunId !== job.workflowRunId || current.status !== 'RUNNING') return;

        for (const listing of listings) {
          const product = await transaction.product.upsert({
            where: { marketplace_asin: { marketplace: job.marketplace, asin: listing.asin } },
            create: {
              asin: listing.asin,
              marketplace: job.marketplace,
              title: listing.title,
              detailUrl: `https://www.amazon.com/dp/${listing.asin}`,
            },
            update: {},
          });
          await transaction.productObservation.upsert({
            where: { jobId_productId: { jobId: job.id, productId: product.id } },
            create: {
              jobId: job.id,
              productId: product.id,
              position: listing.position,
              price: listing.price,
              currency: listing.currency,
              rating: listing.rating,
              reviewCount: listing.reviewCount,
              provider: job.source,
              evidenceUrl: listing.evidenceUrl,
            },
            update: {},
          });
        }

        await transaction.researchJob.updateMany({
          where: { id: job.id, status: 'RUNNING', workflowRunId: job.workflowRunId },
          data: { status: 'SUCCEEDED', completedAt: new Date(), errorMessage: null },
        });
      });
      safeLog('research_completed', { jobId: job.id, source: job.source, resultCount: listings.length });
    });
  },
  {
    failureFunction: async ({ context, failStatus }) => {
      const payload = context.requestPayload as Partial<WorkflowPayload> | undefined;
      if (payload?.jobId && payload.workflowRunId) {
        await getDb().researchJob.updateMany({
          where: {
            id: payload.jobId,
            workflowRunId: payload.workflowRunId,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: 'Research workflow failed after retries.',
          },
        });
        safeLog('research_workflow_failed', {
          jobId: payload.jobId,
          failStatus: String(failStatus).slice(0, 40),
        });
      }
      return 'Research workflow failed.';
    },
  },
);
