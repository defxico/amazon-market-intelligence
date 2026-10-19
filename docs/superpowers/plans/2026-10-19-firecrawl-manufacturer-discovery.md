# Firecrawl Manufacturer Discovery Implementation Plan

> **For agentic workers:** Execute inline by default with superpowers:executing-plans. Use sub-agent workflows only when the user explicitly invokes a sub-agent skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded Firecrawl web search for saved, non-synthetic Amazon products and let approved candidate pages reuse the existing enrichment flow.

**Architecture:** Add an authenticated REST search route backed by `Firecrawl.search` with `sources: ['web']` and `limit: 5`; omit `scrapeOptions`. Persist deduplicated candidates against products with `relationshipVerified=false`; selected candidates use `/api/enrich` and the existing domain allowlist before their evidence links to candidate and product.

**Tech Stack:** Next.js App Router, TypeScript, Firecrawl SDK 4.46.0, Prisma/PostgreSQL, Upstash Redis, Node `test`, `tsx`.

## Global Constraints

- Search requires bearer auth, uses the existing five-calls-per-hour enrichment limiter, and reserves the shared Firecrawl daily budget.
- Search remains disabled unless `FIRECRAWL_SEARCH_ENABLED=true`; leave it false until search/snippet rights and budget are approved.
- Search never scrapes results, starts a crawl, includes `scrapeOptions`, or runs against synthetic-only products.
- Candidate/product relationships remain unverified; page content requires approved domain and use before storage.
- Tests use injected fake provider results; do not make paid calls, enable collection, change `DATA_MODE`, expose secrets, push, or deploy.
- Deliver one implementation commit.

---

### Task 1: Lock down search normalization

**Files:**

- Create: `src/lib/manufacturer-discovery.test.ts`
- Modify: `package.json`

**Interfaces:** `discoverManufacturerCandidates(product, search)` calls the injected search function with `{ limit: 5, sources: ['web'] }` and returns candidates with `name`, `url`, `snippet`, `source`, and `relationshipVerified: false`.

- [x] Add `"test": "tsx --test src/lib/manufacturer-discovery.test.ts"` and tests for a disabled-by-default search flag, empty results, invalid URLs, duplicate URLs, provider rejection, and synthetic-only products.
- [x] Run `npm test`; confirm it fails because `src/lib/manufacturer-discovery.ts` does not exist yet.

### Task 2: Implement bounded discovery and selected-page enrichment

**Files:**

- Create: `src/lib/enrichment-url.ts`, `src/lib/enrichment-url-server.ts`, `src/lib/manufacturer-discovery.ts`, `src/lib/manufacturer-discovery-service.ts`, `src/app/api/manufacturers/search/route.ts`
- Modify: `src/lib/enrichment.ts`, `src/lib/schemas.ts`, `src/app/api/enrich/route.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261019120000_manufacturer_candidates/migration.sql`

**Interfaces:** `POST /api/manufacturers/search` accepts `{ "asin": "B0EXAMPLE1" }`; `POST /api/enrich` keeps `{ "url": "https://..." }` and also accepts `{ "candidateId": "..." }`. Search uses `Firecrawl.search(query, { limit: 5, sources: ['web'] })`; `/api/enrich` validates selected candidate URLs against `APPROVED_ENRICHMENT_DOMAINS` before scraping.

- [x] Reuse `permitEnrichment` and `reserveProviderCall('firecrawl')` for per-call and daily limits.
- [x] Require one successful non-synthetic saved observation before spending search budget.
- [x] Persist candidates with a unique `(productId, urlHash)` key and always set `relationshipVerified=false`.
- [x] Store selected-page evidence with `productId` and `candidateId` only after validating the provider's final source URL.
- [x] Regenerate Prisma Client; run `npm test`, `npm run typecheck`, and `npm run lint`.

### Task 3: Document approval boundaries and commit

**Files:**

- Modify: `README.md`, `guide.md`, `src/app/page.tsx`, `docs/checklist-publicacao.md`, `docs/como-obter-acessos.md`, `scripts/check-env.mjs`, `.env.example`
- Modify: `package.json` only if test command needs correction

- [x] Explain that search snippets and selected-page collection have separate approval boundaries; an allowlist is required only to scrape a selected domain.
- [x] Check environment validation with fake fixture settings: default search stays disabled; enabled search rejects missing Firecrawl credentials.
- [x] Run Prisma validation and inspect `git diff --check`, `git status`, and complete diff.
- [x] Commit all feature and documentation files once with `feat: discover manufacturer candidates with Firecrawl`.
