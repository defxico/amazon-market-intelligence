import 'server-only';
import { getDb } from './db';
import { safeLog } from './http';
import { dispatchDueOutbox } from './research-service';

function retentionDays(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export async function runOutboxReconciliation() {
  return dispatchDueOutbox(25);
}

export async function runRetentionCleanup() {
  const observationDays = retentionDays('OBSERVATION_RETENTION_DAYS', 30, 1, 3_650);
  const usageDays = retentionDays('USAGE_RETENTION_DAYS', 365, 30, 3_650);
  const now = Date.now();
  const observationCutoff = new Date(now - observationDays * 86_400_000);
  const usageCutoff = new Date(now - usageDays * 86_400_000);
  const db = getDb();

  const deleted = await db.$transaction(async (transaction) => {
    const evidence = await transaction.enrichmentEvidence.deleteMany({ where: { retrievedAt: { lt: observationCutoff } } });
    const jobs = await transaction.researchJob.deleteMany({
      where: {
        createdAt: { lt: observationCutoff },
        status: { in: ['SUCCEEDED', 'FAILED', 'DISPATCH_FAILED'] },
      },
    });
    const usage = await transaction.providerUsage.deleteMany({ where: { createdAt: { lt: usageCutoff } } });
    const products = await transaction.product.deleteMany({ where: { observations: { none: {} } } });
    return { evidence: evidence.count, jobs: jobs.count, usage: usage.count, products: products.count };
  });
  safeLog('retention_cleanup_completed', deleted);
  return deleted;
}
