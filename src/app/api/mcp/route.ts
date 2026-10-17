import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { verifyBearerToken } from '@/lib/auth';
import { AppError, DispatchError } from '@/lib/errors';
import { getResearch, createResearch } from '@/lib/research-service';
import { researchInput, trendKeywordInput, jobIdInput } from '@/lib/schemas';
import { getTrends } from '@/lib/trend-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeToolError(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const message = error instanceof DispatchError
    ? `Dispatch pending for job ${error.jobId}. Check its status URL.`
    : error instanceof AppError
      ? error.message
      : 'The requested operation could not be completed.';
  return { content: [{ type: 'text', text: message }], isError: true };
}

const handler = createMcpHandler((server) => {
  server.registerTool('research_products', {
    title: 'Research Amazon products',
    description: 'Start one bounded Amazon.com keyword observation. Returns a job ID; data source and synthetic status are recorded on the job.',
    inputSchema: researchInput,
  }, async (input, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      const result = await createResearch(input, undefined, clientId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });

  server.registerTool('get_research', {
    title: 'Get research job',
    description: 'Read job state and normalized product observations by job ID.',
    inputSchema: z.object({ jobId: jobIdInput }),
  }, async ({ jobId }, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      const result = await getResearch(jobId, clientId);
      if (!result) return { content: [{ type: 'text', text: 'Research job not found.' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });

  server.registerTool('get_trends', {
    title: 'Compare saved observations',
    description: 'Compare compatible Amazon.com snapshots. Rank, price and review changes are directional sample signals, not verified sales or demand.',
    inputSchema: z.object({ keyword: trendKeywordInput }),
  }, async ({ keyword }, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      return { content: [{ type: 'text', text: JSON.stringify(await getTrends(keyword, clientId)) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });
}, {
  serverInfo: { name: 'amazon-market-intelligence', version: '2.0.0' },
  instructions: 'Use research_products to queue bounded observations, then get_research to poll. get_trends reports sample rank proxies only; do not describe these as sales, revenue, demand, or market share.',
  verboseLogs: false,
});

const verifyToken = async (_request: Request, token?: string): Promise<AuthInfo | undefined> => {
  if (!verifyBearerToken(token)) return undefined;
  if (!token) return undefined;
  return {
    token,
    clientId: 'private-api-client',
    scopes: ['research:read', 'research:write'],
  };
};

const securedHandler = withMcpAuth(handler, verifyToken, { required: true });
export { securedHandler as GET, securedHandler as POST };
