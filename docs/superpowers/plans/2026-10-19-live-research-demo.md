# Live Research Demo Implementation Plan

> **For agentic workers:** Execute inline by default. Keep implementation in one commit per repository.

**Goal:** Complete one persisted protein-bar research flow through REST, MCP, and a separately deployed operational demo UI.

**Architecture:** Add a read-only saved-candidate REST operation backed by the existing Prisma service. Route MCP search/read tools through the same services and limits. Build a separate UI app whose server routes proxy HTTPS requests to the published API and keep `RESEARCH_API_KEY` server-only. Preserve the existing presentation page and add one demo link.

**Tech Stack:** Next.js 16, TypeScript, Prisma/Postgres, Firecrawl search, MCP Streamable HTTP, separate Sites deployment.

## Global Constraints

- Search input stays bounded to five Firecrawl web results and the existing provider budget.
- Candidates always expose `relationshipVerified: false`; no candidate is described as a confirmed manufacturer.
- Synthetic research stays visibly marked; no tests call Firecrawl.
- UI server proxies the existing API and never imports server internals.
- Keep action paid and explicit; make no more than one controlled production Firecrawl request.

---

### Task 1: REST and MCP

**Files:** `src/lib/manufacturer-discovery-service.ts`, `src/app/api/manufacturers/route.ts`, `src/app/api/manufacturers/search/route.ts`, `src/app/api/mcp/route.ts`, `src/lib/manufacturer-discovery.test.ts`, `README.md`.

**Interfaces:** `GET /api/manufacturers?asin=B00MNXGSAI` reads up to five latest saved candidates. `search_saved_product_candidates({ asin })` and `get_saved_product_candidates({ asin })` call those same service operations; both use the existing bearer auth, rate limits, and provider cap.

- [ ] Add focused checks for saved candidate response fields and unverified relationship state.
- [ ] Implement read operation and shared MCP service calls.
- [ ] Verify MCP `tools/list` and candidate read with a real MCP client; run `npm test`, typecheck, lint, Prisma validation, and build.

### Task 2: Independent demo app

**Files:** separate `demo-ui/` app and repository, its server-side API proxy routes, app UI, tests, `.env.example`, and short README.

- [ ] Build searchable job submission/polling, saved-product selection, candidate re-open, and explicit guarded Firecrawl action against the production HTTPS API only.
- [ ] Keep API key in private runtime configuration; do not expose it in client code, URL, screenshot, or source.
- [ ] Verify build, typecheck, no-secret scan, and browser flow; capture screenshot.

### Task 3: Site integration and delivery

**Files:** `src/app/page.tsx`, `docs/demo-ui.png`, root `README.md`.

- [ ] Correct the Firecrawl description and MCP tool count while preserving the page design; add the deployed demo link.
- [ ] Deploy API and private demo independently, run one controlled paid Firecrawl check at most, record its request IDs/status/credits, and commit verified source.
