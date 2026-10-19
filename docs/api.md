# REST and MCP API

Base URL: `https://amazon-market-intelligence.vercel.app`. All research routes require `Authorization: Bearer $RESEARCH_API_KEY`. Responses are JSON, use `Cache-Control: no-store`, and include `X-Request-Id`. Never send the key from browser JavaScript; use a trusted server proxy.

## Async product research

`POST /api/research` accepts a strict JSON body:

```json
{
  "keyword": "protein bar",
  "marketplace": "amazon.com",
  "page": 1,
  "limit": 10
}
```

`keyword` is 2–120 characters and normalized to lowercase. `marketplace` is `amazon.com`; `page` is 1–3; `limit` is 1–20. Omitted marketplace, page, and limit default to `amazon.com`, `1`, and `10`. An optional `Idempotency-Key` must contain 1–100 printable ASCII characters. Reuse the same key when retrying the same submission.

New live jobs request Amazon's `Best Sellers` order for the keyword via SerpApi. This is Amazon's ranking, not a unit-sales count or search-volume measurement. Earlier jobs keep the `featured` search order in their saved metadata.

The API creates a durable job and returns `202 Accepted`:

```json
{
  "jobId": "job-id",
  "status": "QUEUED",
  "statusUrl": "/api/research/job-id"
}
```

Poll `GET /api/research/{jobId}` until `SUCCEEDED`, `FAILED`, or `DISPATCH_FAILED`. The result includes `searchRanking` (`best_sellers` or historical `featured`), `source`, `synthetic`, timestamps, and observed products. Treat `synthetic: true` as fixture data. Search positions and reviews are observations, not sales. Trend comparisons use only jobs with matching ranking methods.

## Saved Firecrawl candidates

`GET /api/manufacturers?asin=B00MNXGSAI` reads up to five saved candidates. It never calls Firecrawl, so refreshes and reopened UI sessions do not consume credits. The ASIN must already be saved by a product observation.

```json
{
  "asin": "B00MNXGSAI",
  "title": "Saved Amazon product title",
  "candidates": [
    {
      "id": "candidate-id",
      "name": "Search result title",
      "title": "Search result title",
      "url": "https://example.com/product",
      "snippet": "Search result excerpt",
      "source": "firecrawl.search.manufacturer-v1",
      "relationshipVerified": false,
      "firstSeenAt": "2026-10-19T12:00:00.000Z",
      "lastSeenAt": "2026-10-19T12:00:00.000Z"
    }
  ],
      "warning": "Search-result pages mention manufacturing capabilities; company identity and product fit are unverified."
}
```

`POST /api/manufacturers/search` is the explicit paid operation. It accepts `{ "asin": "B00MNXGSAI" }`, requires a saved product with a successful non-synthetic observation, and uses the product title without its brand or ASIN to search for similar-product private-label, OEM, and contract manufacturing capacity. It excludes common retail marketplace domains and results without manufacturing signals, then returns up to five unverified leads. It does not scrape result pages. The shared Firecrawl daily budget and per-client rate limit apply.

The response includes the same candidate fields plus `providerUsageRequestId`, `creditsUsed`, `source`, `rightsProfile`, a warning, and the API `requestId`. New candidates use source `firecrawl.search.manufacturer-v1`; earlier records may retain `firecrawl.search` and were not screened by this filter. New candidates match manufacturing terms in search titles, snippets, or URLs; this does not confirm a real factory, its production capacity, or its fit for the selected product. `creditsUsed` is the observed change in the Firecrawl account's remaining-credit count and may be `null` if the provider usage snapshots are unavailable or changed concurrently. The provider request uses one attempt; it is not automatically retried.

## Errors

Errors use `{ "error": { "code", "message" }, "requestId" }` and do not include provider secrets or stack traces.

| HTTP | Codes | Meaning |
|---|---|---|
| `400`, `413`, `415`, `422` | `VALIDATION_ERROR` | Invalid JSON, body, ASIN, keyword, or job ID |
| `401` | `UNAUTHORIZED` | Missing or invalid bearer token |
| `404` | `NOT_FOUND` | Job or saved ASIN does not exist |
| `429` | `RATE_LIMITED`, `BUDGET_EXHAUSTED` | Per-client limit or daily provider budget reached |
| `502` | `PROVIDER_UNAVAILABLE` | Search provider failed |
| `503` | `DEPENDENCY_UNAVAILABLE`, `WORKFLOW_DISPATCH_FAILED` | Required service unavailable or async dispatch pending |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

`WORKFLOW_DISPATCH_FAILED` may also include `jobId` and `statusUrl`; keep polling that job rather than submitting a duplicate.

## MCP over Streamable HTTP

Connect an MCP client to `https://amazon-market-intelligence.vercel.app/api/mcp` with the same bearer token. `tools/list` exposes five tools:

- `research_products({ keyword, marketplace?, page?, limit? })`
- `get_research({ jobId })`
- `get_trends({ keyword })`
- `search_saved_product_candidates({ asin })` — paid Firecrawl search, same validation, rate limit, provider budget, and persistence as REST.
- `get_saved_product_candidates({ asin })` — read saved results without a provider call.

Tool results return JSON in MCP text content. Candidate names are search-result titles, and every candidate remains explicitly unverified. The MCP search and REST search use the same service and database; the MCP client smoke script can optionally run one paid search with `npm run smoke:mcp -- --search`. Without `--search`, it only lists tools and reads saved candidates.

The REST-only `POST /api/enrich` accepts either `{ "url": "https://..." }` or `{ "candidateId": "..." }`. Selected-page scraping retains the existing `APPROVED_ENRICHMENT_DOMAINS` allowlist and rights checks. No enrichment tool is exposed over MCP.
