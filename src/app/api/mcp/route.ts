import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { verifyBearerToken } from '@/lib/auth';
import { AppError, DispatchError } from '@/lib/errors';
import { getResearch, createResearch } from '@/lib/research-service';
import { getSavedProductCandidates, searchSavedProductManufacturers } from '@/lib/manufacturer-discovery-service';
import { manufacturerSearchInput, researchInput, trendKeywordInput, jobIdInput } from '@/lib/schemas';
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
    description: 'Compare compatible real Amazon.com snapshots. Synthetic fixture snapshots return no trend signals. Rank, price and review changes are directional sample signals, not verified sales or demand.',
    inputSchema: z.object({ keyword: trendKeywordInput }),
  }, async ({ keyword }, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      return { content: [{ type: 'text', text: JSON.stringify(await getTrends(keyword, clientId)) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });

  server.registerTool('search_saved_product_candidates', {
    title: 'Search candidates for a saved product',
    description: 'Use one bounded Firecrawl web search for a saved, successfully observed non-synthetic Amazon product. Returns at most five unverified candidate pages; this operation consumes the shared Firecrawl budget.',
    inputSchema: manufacturerSearchInput,
  }, async ({ asin }, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      const result = await searchSavedProductManufacturers(asin, clientId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });

  server.registerTool('get_saved_product_candidates', {
    title: 'Read saved product candidates',
    description: 'Read up to five already persisted Firecrawl search candidates for a saved ASIN without making another provider request.',
    inputSchema: manufacturerSearchInput,
  }, async ({ asin }, context) => {
    try {
      const clientId = context.http?.authInfo?.clientId ?? 'private-api-client';
      const result = await getSavedProductCandidates(asin, clientId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return safeToolError(error);
    }
  });
}, {
  serverInfo: { name: 'amazon-market-intelligence', version: '2.0.0' },
  instructions: 'Use research_products to queue bounded observations, then get_research to poll. Use search_saved_product_candidates only after selecting a saved, non-synthetic product because it consumes Firecrawl budget. Use get_saved_product_candidates to reopen saved results without another provider request. Do not treat synthetic fixture data as real research. Candidate pages are not verified manufacturers. get_trends reports sample rank proxies only; do not describe these as sales, revenue, demand, or market share.',
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
