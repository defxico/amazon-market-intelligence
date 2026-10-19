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

`GET /api/manufacturers?asin=B00MNXGSAI` reads up to five screened candidates matching the most recent product brief, plus up to five older unscreened records under `legacyCandidates`. It includes the latest search status, brief, request ID, diagnostics, and time. It never calls Firecrawl, so refreshes and reopened UI sessions do not consume credits. The ASIN must already be saved by a product observation.

```json
{
  "asin": "B00MNXGSAI",
  "title": "Saved Amazon product title",
  "productBrief": "chocolate protein bar for private label",
  "searchStatus": "SUCCEEDED",
  "providerUsageRequestId": "provider-request-id",
  "searchedAt": "2026-10-19T12:00:00.000Z",
  "diagnostics": {
    "returned": 10,
    "rejectedInvalid": 0,
    "rejectedRetailOrSocial": 2,
    "rejectedThirdParty": 1,
    "rejectedBrandPage": 0,
    "rejectedCategory": 3,
    "rejectedNoB2BService": 2,
    "rejectedDuplicate": 1,
    "capped": 0,
    "saved": 1
  },
  "candidates": [
    {
      "id": "candidate-id",
      "name": "Search result title",
      "title": "Search result title",
      "url": "https://example.com/product",
      "snippet": "Search result excerpt",
      "productBrief": "chocolate protein bar for private label",
      "contactUrl": null,
      "capabilityStatus": "SEARCH_EVIDENCE",
      "source": "firecrawl.search.manufacturer-v2",
      "relationshipVerified": false,
      "firstSeenAt": "2026-10-19T12:00:00.000Z",
      "lastSeenAt": "2026-10-19T12:00:00.000Z"
    }
  ],
  "previousCandidates": [],
  "legacyCandidates": [],
  "warning": "Search evidence does not confirm production capacity, quality, MOQ, availability, or a relationship to the Amazon brand."
}
```

`POST /api/manufacturers/search` is the explicit paid operation. It accepts `{ "asin": "B00MNXGSAI", "productBrief": "chocolate protein bar for private label" }`, requires a saved product with a successful non-synthetic observation, and uses the buyer's brief rather than inferring category from the Amazon title or research keyword. The brief must be 8–160 characters and cannot include an URL or ASIN. Firecrawl receives one web search with a limit of ten results and exclusions for common retailers, social sites, and directories. Local screening also requires a category token and a private-label/OEM/contract-manufacturing signal, rejects known third-party pages and pages for the Amazon product's brand, deduplicates by company host, and returns up to five leads. A zero result is valid and includes rejection counts. The shared Firecrawl daily budget and per-client rate limit apply.

The response includes `diagnostics` (`returned`, counts rejected by reason, and `saved`), `providerUsageRequestId`, `creditsUsed`, `rightsProfile`, a warning, and the API `requestId`. `SEARCH_EVIDENCE` means only the search result title/snippet matched the brief and B2B signal. Use `POST /api/enrich` with `{ "candidateId": "..." }` to inspect a selected candidate's page; its host must be in `APPROVED_ENRICHMENT_DOMAINS`. That page read updates capability status to `PAGE_EVIDENCE` or `PAGE_NOT_CONFIRMED` based on the saved brief. Neither state confirms capacity, quality, MOQ, availability, or a relationship to the Amazon brand. Earlier records with status `LEGACY` were not screened and never count as new leads. `creditsUsed` is the observed change in the Firecrawl account's remaining-credit count and may be `null` if provider snapshots are unavailable or changed concurrently. The provider search uses one attempt; it is not automatically retried.

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
- `search_saved_product_candidates({ asin, productBrief })` — paid Firecrawl search, same validation, rate limit, provider budget, and persistence as REST.
- `get_saved_product_candidates({ asin })` — read saved results without a provider call.

Tool results return JSON in MCP text content. Candidate names are search-result titles, and every candidate remains explicitly unverified. The MCP search and REST search use the same service and database; the MCP client smoke script can optionally run one paid search with `MCP_TEST_ASIN` and `MCP_TEST_PRODUCT_BRIEF` set, then `npm run smoke:mcp -- --search`. Without `--search`, it only lists tools and reads saved candidates.

The REST-only `POST /api/enrich` accepts either `{ "url": "https://..." }` or `{ "candidateId": "..." }`. Selected-page scraping retains the existing `APPROVED_ENRICHMENT_DOMAINS` allowlist and rights checks. No enrichment tool is exposed over MCP.
