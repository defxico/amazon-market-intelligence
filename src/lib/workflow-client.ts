import 'server-only';
import { Client } from '@upstash/workflow';
import { workflowConfig } from './env';

export async function triggerResearchWorkflow(jobId: string, workflowRunId: string): Promise<void> {
  const { baseUrl, token } = workflowConfig();
  const client = new Client({ token });
  await client.trigger({
    url: `${baseUrl}/api/workflows/research`,
    body: { jobId, workflowRunId },
    workflowRunId,
    retries: 3,
    retryDelay: '1000 * (1 + retried)',
  });
}
