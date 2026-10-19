import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const endpoint = new URL(process.env.MCP_URL ?? 'https://amazon-market-intelligence.vercel.app/api/mcp');
const token = process.env.RESEARCH_API_KEY;
const asin = (process.env.MCP_TEST_ASIN ?? 'B00MNXGSAI').trim().toUpperCase();
const productBrief = (process.env.MCP_TEST_PRODUCT_BRIEF ?? '').trim();
const runPaidSearch = process.argv.includes('--search');
if (runPaidSearch && productBrief.length < 8) {
  throw new Error('Set MCP_TEST_PRODUCT_BRIEF to describe the product before running a paid manufacturer search.');
}

if (!token) throw new Error('RESEARCH_API_KEY must be set in the server environment or local .env file.');
if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error('MCP_TEST_ASIN must be a valid Amazon ASIN.');

const client = new Client({ name: 'amazon-market-intelligence-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

function parseToolResult(result) {
  const content = result.content.find((item) => item.type === 'text');
  if (result.isError || !content) throw new Error(content?.text ?? 'MCP tool returned no text result.');
  return JSON.parse(content.text);
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const required = [
    'research_products',
    'get_research',
    'get_trends',
    'search_saved_product_candidates',
    'get_saved_product_candidates',
  ];
  const names = new Set(tools.map((tool) => tool.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`MCP tools/list is missing: ${missing.join(', ')}`);

  let searchResult = null;
  if (runPaidSearch) {
    searchResult = parseToolResult(await client.callTool({
      name: 'search_saved_product_candidates',
      arguments: { asin, productBrief },
    }));
    if (searchResult.candidates.some((candidate) => candidate.relationshipVerified !== false)) {
      throw new Error('Search returned a candidate without relationshipVerified=false.');
    }
  }

  const saved = parseToolResult(await client.callTool({
    name: 'get_saved_product_candidates',
    arguments: { asin },
  }));
  if (!Array.isArray(saved.candidates) || saved.candidates.length > 5) {
    throw new Error('Saved candidate read must return an array of at most five candidates.');
  }
  if (saved.candidates.some((candidate) => candidate.relationshipVerified !== false)) {
    throw new Error('Saved candidate read returned a candidate without relationshipVerified=false.');
  }

  console.log(JSON.stringify({
    toolsListed: tools.length,
    requiredToolsPresent: required,
    invoked: runPaidSearch
      ? ['search_saved_product_candidates', 'get_saved_product_candidates']
      : ['get_saved_product_candidates'],
    asin: saved.asin,
    savedCandidateCount: saved.candidates.length,
    providerUsageRequestId: searchResult?.providerUsageRequestId ?? null,
    creditsUsed: searchResult?.creditsUsed ?? null,
    apiRequestId: searchResult?.requestId ?? null,
  }, null, 2));
} finally {
  await client.close();
}
