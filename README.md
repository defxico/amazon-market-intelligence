# Amazon Market Intelligence

Private, API-first Amazon.com search intelligence. The production REST API and stateless Streamable HTTP MCP share service logic. Prisma Postgres stores durable jobs and source-attributed observations; Upstash Redis enforces request and provider budgets; QStash/Workflow runs provider calls asynchronously.

The API is live at `https://amazon-market-intelligence.vercel.app`. The separate owner-private [live research demonstration](https://ami-live-research-demo.gipyware-0848.chatgpt.site/) uses the REST API through server-side routes; its source is [amazon-market-intelligence-demo](https://github.com/defxico/amazon-market-intelligence-demo). [API and MCP contract](./docs/api.md) documents request shapes and limits.

Para autorizar as contas, custos e credenciais necessários à publicação, use o [checklist de publicação](./docs/checklist-publicacao.md).

## Product limits

- SerpApi Amazon Search is the only live Amazon listing source. `DATA_MODE=fixture` is available for synthetic development and never becomes an automatic fallback.
- New live product research uses Amazon's `Best Sellers` sort for the submitted keyword through SerpApi (`s=exact-aware-popularity-rank`). It reports a ranking, not units sold or search volume. Jobs created before this change retain the `featured` label and are not mixed with Best Sellers jobs in trend comparisons.
- Firecrawl search targets companies advertising private-label, OEM, or contract manufacturing for products similar to a saved, non-synthetic Amazon product. It excludes common retail marketplaces and search pages without manufacturing signals, then saves up to five leads with source `firecrawl.search.manufacturer-v1`. Older saved results remain available as `firecrawl.search` and are not retroactively screened. Search snippets do not prove factory identity, production capacity, or product fit. `GET /api/manufacturers?asin=...` reopens saved leads without another provider call. Reading a selected page still follows the existing domain allowlist.
- Trends compare saved observations and remain directional rank/price/review proxies. They are not sales, revenue, demand, or market-share measurements.
- This is a single-tenant API key model. Use an OAuth/OIDC identity system and tenant isolation before offering it to unrelated customers.
- Commercial production use requires a plan that permits commercial traffic and separate budget controls for every vendor.

## Stack

Node.js 24, Next.js App Router, TypeScript, Prisma ORM 7 and Prisma Postgres, Upstash Redis REST, Upstash Workflow/QStash, SerpApi, Firecrawl, and MCP Server SDK 2 behind `mcp-handler`.

## Local setup

Use a development database and separate credentials from production. The application has no Docker or always-on worker requirement.

```bash
nvm use
npm ci
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Put the first generated value in `RESEARCH_API_KEY` and the second in `CRON_SECRET`. Fill `DATABASE_URL` with the pooled Prisma Postgres URL and `DIRECT_URL` with its direct URL. Add an Upstash Redis REST URL/token and set `QSTASH_DEV=true` for local workflows. Keep `DATA_MODE=fixture`; live provider keys are not needed for fixture data. `APP_BASE_URL` should be `http://localhost:3000` locally.

Apply the initial migration to the **development database** and start Next.js:

```bash
npm run db:generate
npm run db:migrate
npm run dev
```

Before promoting code, these project checks are available:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run env:check
```

The fixture still uses Postgres, Redis, and local QStash Workflow, so job creation and callback replay follow the real architecture. Health works without credentials; every other REST surface and MCP requires a bearer key.

## REST API

Protected routes require `Authorization: Bearer $RESEARCH_API_KEY`. Responses use `Cache-Control: no-store` and errors use `{ "error": { "code", "message" }, "requestId" }`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Anonymous liveness response; does not check dependencies |
| `POST` | `/api/research` | Queue one keyword job ordered by Amazon Best Sellers in live mode; accepts `Idempotency-Key` |
| `GET` | `/api/research/{jobId}` | Read status, `searchRanking`, source, synthetic marker, results, and provenance |
| `GET` | `/api/trends?keyword=...` | Compare compatible snapshots or return `insufficient_history` |
| `GET` | `/api/manufacturers?asin=...` | Read up to five saved candidate pages without a provider request |
| `POST` | `/api/manufacturers/search` | Search up to five web results for a saved, non-synthetic ASIN; candidates stay unverified |
| `POST` | `/api/enrich` | Fetch one approved public-site excerpt by URL or saved `candidateId` |
| `GET`, `POST` | `/api/mcp` | Authenticated MCP tools: `research_products`, `get_research`, `get_trends`, `search_saved_product_candidates`, `get_saved_product_candidates` |

Search only accepts an ASIN already saved from a successful non-synthetic observation. Replace the placeholder ASIN with a saved one. Pass one returned candidate's `id` to `/api/enrich` to read its page; this still requires the candidate domain to be approved:

```json
{ "asin": "B0EXAMPLE1" }
```

```json
{ "candidateId": "cm1234567890abcdef1234567" }
```

Example submission:

```bash
curl -i -X POST http://localhost:3000/api/research \
  -H "Authorization: Bearer $RESEARCH_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: fixture-portable-blender-001' \
  -d '{"keyword":"portable blender","marketplace":"amazon.com","page":1,"limit":10}'
```

Poll the returned `statusUrl` until `SUCCEEDED` or a terminal failure. The fixture job is synthetic and is clearly marked as such. Trend comparisons require two compatible, successful, non-synthetic snapshots; fixture data returns no trend signals.

## Production release

Read [guide.md](./guide.md) for provider provisioning, exact environment setup, migration order, Vercel release, callback reachability, smoke checks, and recovery steps. [spec.md](./spec.md) defines product constraints; [architecture.md](./architecture.md) describes system boundaries and persistence.

Production configuration requires:

- A stable HTTPS `APP_BASE_URL` before accepting research requests.
- Pooled `DATABASE_URL` at runtime and direct `DIRECT_URL` only for migration/admin work.
- `RESEARCH_API_KEY`, `CRON_SECRET`, Upstash Redis credentials, QStash token and both signing keys.
- `DATA_MODE=fixture` until SerpApi collection, storage, and commercial-use rights are approved. Then set `SERPAPI_API_KEY` and a conservative daily budget.
- `SERPAPI_RIGHTS_PROFILE` names the reviewed live-data use profile and is persisted with each job. It is an audit label, not a substitute for the rights review.
- Firecrawl search requires `FIRECRAWL_SEARCH_ENABLED=true`, an approved search/snippet use profile, and a conservative `MAX_FIRECRAWL_CALLS_PER_DAY`; this production deployment has search enabled. The same daily budget covers search and scrape calls. `ENRICHMENT_RIGHTS_PROFILE` is an audit label, not a substitute for rights approval.
- `APPROVED_ENRICHMENT_DOMAINS` is required for selected-page scraping. The allowlist and page-content use/storage rights must be approved before scraping. Search results never trigger a scrape or crawl automatically.
- `QSTASH_DEV` unset in production. Apply migrations with `npm run db:deploy` before routing traffic to a release that requires them.

Run `npm run env:check:production` in a release shell after loading the production environment. It checks required configuration and secret lengths without printing secret values or connecting to services.

`vercel.json` schedules protected retention cleanup daily, which fits Vercel Hobby's once-per-day cron limit. Configure QStash to call `/api/cron/outbox` every five minutes; its schedule forwards `Authorization: Bearer $CRON_SECRET`. See [guide.md](./guide.md) for the exact setup. Vercel Pro/Enterprise is required when the deployment is commercial; verify current provider plans and data rights independently.

## CI and maintenance

Pull requests and pushes to `main` run Prisma schema validation, lint, typecheck, and production build. Live APIs and databases are not contacted by CI. Database migrations are a separate authorized release step, never a build or request-time action.

The initial migration is in `prisma/migrations/20261015220000_init/`. Do not edit an applied migration. Add new additive migrations and use expand/migrate/contract for later changes. Keep development, preview, and production databases and provider budgets separate.
