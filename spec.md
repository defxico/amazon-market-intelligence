# Amazon Market Intelligence API + MCP - Product and Delivery Specification

**Version:** 2.1 | **Updated:** 2026-10-15 | **Status:** Implemented code baseline and acceptance contract; production release pending external provisioning | **Owner:** Gipyware

**Companion files:** [architecture.md](./architecture.md) - binding technical design; [guide.md](./guide.md) - executable developer runbook.

> This repository implements the MVP application and deployment scaffold described here. The original 60-minute estimate applies only after account provisioning and approved API credentials; no production deployment, live provider use, legal approval, or production smoke run is claimed. No Docker, EC2, Coolify, always-on workers, Amazon SP-API, Amazon PA-API, or Amazon Creators API.

## 1. Executive definition

Build a Vercel-hosted, API-first market intelligence service that accepts an Amazon search keyword, gathers current Amazon search-result signals from SerpApi, optionally enriches explicitly approved brand/manufacturer websites through Firecrawl, stores source-attributed historical observations in Prisma Postgres, computes transparent directional trends, and publishes the same application operations through authenticated REST and remote MCP (Streamable HTTP).

**Keychain positioning:** Keychain is broader than product discovery; it also addresses manufacturer sourcing/network workflows. The MVP implements Amazon-centric product/brand intelligence, **not** a clone of Keychain's private supplier network, sourcing verification, or CRM. Manufacturer identification is a separately validated later phase. Do not advertise verified suppliers from inferred links.

**Primary user:** developer, category researcher, founder, and AI coding/research agent. **Initial marketplace:** `amazon.com` / `en_US` / USD only. **Product contract:** API/MCP and a simple root landing/status page; no full analytics dashboard required in the first hour.

## 2. Mandatory constraints

| Area | Requirement |
|---|---|
| Hosting | Vercel, Next.js App Router, Node.js runtime; single deployable project |
| Language | TypeScript strict; Node.js 22.12+ or 24 LTS; npm with committed lockfile |
| API | Next.js Route Handlers; avoid Fastify/NestJS adapters for the 60-minute fast path |
| MCP | `mcp-handler@2` + `@modelcontextprotocol/server@2` + Zod 4; stateless HTTP at `/api/mcp` |
| Database | Managed **Prisma Postgres** Free initially; **Prisma ORM 7** + `@prisma/adapter-pg` |
| DB URLs | `DATABASE_URL` pooled at runtime; `DIRECT_URL` direct for migration/admin |
| Redis | Upstash Redis over HTTPS (`@upstash/redis`), for rate limits and provider-budget counters |
| Background jobs | **Upstash Workflow/QStash**; signed callbacks to Vercel routes, no perpetual worker |
| BullMQ | **Not instantiated on Vercel.** BullMQ requires an active worker process; keep it as a later optional deployment mode only if an external worker is explicitly approved |
| Marketplace data | **SerpApi Amazon Search API only** for current Amazon listing observations |
| Web research | **Firecrawl only** for user-approved public brand/manufacturer sites and permissible enrichment; never assume permission to scrape any URL |
| Other third parties | OpenAI and Airtable are **optional P1**, OFF by default; no additional scraping/search providers |
| Operations | Secrets in Vercel environment settings; migrations via CI/manual release command, never per HTTP request |
| Containers | No Dockerfiles, Docker Compose, Kubernetes, self-hosted worker or VM steps |

## 3. Honest one-hour scope

### P0: implemented application scope; external release steps remain

1. Landing page and anonymous `/api/health` with no secret disclosure.
2. API key authentication on all research REST endpoints and the MCP endpoint; signed Workflow callbacks.
3. `POST /api/research` creates a persisted keyword-research job and enqueues Upstash Workflow, returning HTTP 202 and a job ID.
4. `GET /api/research/{id}` returns the current job, observations, source, timestamps, and errors (redacted).
5. `GET /api/trends?keyword=...` compares two completed observations of matching products when present, otherwise returns `insufficient_history`.
6. `POST /api/enrich` retrieves one explicitly selected public HTTPS page through Firecrawl and stores/returns a bounded attributed excerpt with a rights-profile label.
7. Remote MCP exposes `research_products`, `get_research`, and `get_trends`, sharing exactly the REST application logic.
8. Prisma schema + committed initial migration, Redis atomic rate/budget limits, a transactional workflow outbox, scheduled recovery/retention routes, and structured logging.
9. SerpApi live provider and a deterministic fixture mode for developer testing (fixture is always marked synthetic).
10. Release acceptance gate: publish a production Vercel URL, complete health/authenticated smoke checks, and, only if credentials and terms permit, run one live SerpApi research request. These are operator release steps and are not completed by this repository scaffold.

### P1: after the fast path, before calling this an operational market-intelligence platform

- Scheduled re-observations (e.g., daily keyword watchlists) and historical trend report quality controls.
- Firecrawl brand-site summaries and richer evidence linkage beyond the bounded URL/excerpt/right-profile record.
- Optional OpenAI natural-language explanations grounded exclusively in persisted evidence; never invent sales or suppliers.
- Optional Airtable one-way export with field allowlist and destination audit.
- Richer product pages, watchlist UI, filtered search, reports, exports, operational alerts, backup/restore drill, detailed spend dashboard.
- Team/workspace identity, OAuth 2.1 discovery for third-party MCP hosts, RBAC, service-to-service scopes.

### Explicitly out of scope

- Any official Amazon seller/partner/affiliate API (SP-API, Creators, PA-API).
- Bulk Amazon catalog crawling, CAPTCHA evasion, proxy rotation, credential sharing, Amazon login automation.
- Quantified real sales volumes, revenue, conversion rates, market share or verified manufacturer relationships based only on ranking/review proxies.
- Perpetual BullMQ consumers inside Vercel Functions.
- A cost-free commercial Vercel production deployment: Vercel Hobby is for personal non-commercial projects; use Pro/Enterprise for commercial use.

## 4. Data-access and legal/commercial launch gate

1. Document SerpApi's and Firecrawl's current terms, account quota, intended use, data storage and republishing permissions; third-party access alone does **not** settle underlying marketplace or site rights.
2. Scrape/enrich only authorized, publicly accessible target pages. Do not bypass restrictions or protections. Firecrawl page reads must follow explicit candidate selection; search results never trigger scraping automatically.
3. Retain only normalized listing metadata required by the product. Avoid raw HTML, product images or unlimited provider payload archiving. Use evidence URL/provider/time to preserve provenance.
4. Add configurable retention (`OBSERVATION_RETENTION_DAYS`, default proposed 30 for MVP) and a documented deletion task; actual duration must match applicable permission.
5. Data permission, AI input, storage, reuse and export are separate decisions. Disable export/enrichment until approved.
6. Track observed facts vs derived scores: search position is a *snapshot ranking*, not proven sales velocity or search volume.
7. Store no individual consumer contact information; public brands are not proof of supplier contracts.

**Release decision:** If rights or contractual permissions are unclear, keep `DATA_MODE=fixture` and do not expose commercial live research until review. Document who approved which use case and when.

## 5. User stories and acceptance scenarios

| ID | Story | Acceptance |
|---|---|---|
| US-01 | Researcher submits `"portable blender"` | Valid 202 with ID; job eventually `SUCCEEDED` or explicit `FAILED` |
| US-02 | Caller queries research state | Stable job ID, timestamps, source metadata and normalized result list |
| US-03 | Analyst needs historical change | First snapshot yields `insufficient_history`; later comparable snapshots yield rank/price/review deltas |
| US-04 | Developer invokes through MCP | Same validation/auth/quota/business behavior as REST; valid MCP transport |
| US-05 | Operator wants safe enrichment | Only explicit public HTTPS URLs accepted; local and non-public targets are rejected |
| US-06 | Provider quota expires | No silent fallback to fabricated data; job fails transparently and can be retried |
| US-07 | Replayed workflow callback | Does not duplicate job/product observations |
| US-08 | Team deploys clean project | Required variables set, migration applied once, build succeeds, smoke tests pass |
| US-09 | API key omitted/incorrect | REST/MCP protected calls are denied; logs do not show keys |
| US-10 | Commercial owner deploys | Vercel plan and service quotas checked, budget limits in place |

## 6. Public surface and request contracts

All timestamps UTC ISO 8601. Every non-health REST endpoint requires `Authorization: Bearer <RESEARCH_API_KEY>`. JSON errors follow `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }` where feasible. No 200 status for asynchronous research submission.

### `GET /api/health`

Response 200: `{ "status": "ok", "service": "amazon-market-intelligence", "version": "2.0" }`. Does not contact paid providers and must not expose secret/config values. Use a distinct authenticated `/api/admin/ready` later for real dependency checks.

### `POST /api/research`

Request:

```json
{ "keyword": "portable blender", "marketplace": "amazon.com", "page": 1, "limit": 10 }
```

Validation: `keyword` length 2-120 after trimming; `marketplace` fixed to `amazon.com`; `page` default 1, maximum 3; `limit` default 10, maximum 20; reject unknown/unsupported regions. Request may include `Idempotency-Key` (max 100 characters) to deduplicate repeated submissions within the single-tenant MVP. Rate limit by API client + route.

Response 202:

```json
{ "jobId": "clx...", "status": "QUEUED", "statusUrl": "/api/research/clx..." }
```

If QStash dispatch fails: mark `DISPATCH_FAILED`, return 503 with job ID and actionable retry guidance; never report the research as accepted when not dispatched. If a process stops in the dispatch gap, a later reconciliation pass must detect stranded jobs.

### `GET /api/research/:id`

Response 200:

```json
{
  "jobId": "clx...", "keyword": "portable blender", "status": "SUCCEEDED",
  "createdAt": "2026-10-15T18:00:00.000Z",
  "completedAt": "2026-10-15T18:00:06.000Z",
  "synthetic": false, "source": "serpapi",
  "products": [
    { "asin": "B012345678", "title": "Example product", "position": 1,
      "price": 24.99, "currency": "USD", "rating": 4.5,
      "reviewCount": 122, "observedAt": "2026-10-15T18:00:05.000Z",
      "evidenceUrl": "https://www.amazon.com/dp/B012345678" }
  ]
}
```

Field data above is a **schema illustration, not a real observed product**. Error/status variants: 401 unauthenticated, 404 unknown ID, 429 rate-limited, 500 safe generic error.

### `GET /api/trends?keyword=portable%20blender`

Compares successful snapshots for the normalized keyword using the current fixed cohort (`amazon.com`, page 1, limit 10) and the same source (`fixture` or `serpapi`). It returns `historyCount`, `comparisonWindow`, `signals`, `confidence`, and `methodologyVersion`. With fewer than 2 compatible snapshots it returns `status: "insufficient_history"`, `signals: []`; otherwise status is `directional_only`. Confidence is `limited` only after at least 3 compatible snapshots spanning 7 days, and `low` otherwise. There is no sort/filter dimension in the current request contract. This is not a sales forecast.

### `POST /api/enrich` (limited P0)

`{ "url": "https://manufacturer.example/about" }`; public HTTPS required, 422 for invalid/local URLs, 429 quota, 502 provider failure. Returns `{ url, retrievedAt, source:"firecrawl", excerpt, truncated:true|false }`. **Does not claim verified Amazon seller-to-manufacturer ownership**.

### `GET, POST /api/mcp`

Stateless Streamable HTTP, protected by a bearer token via `withMcpAuth`. Register typed tools:

| MCP tool | Inputs | Output | Side effect |
|---|---|---|---|
| `research_products` | `keyword`, optional `page`, `limit` | job ID/status URI | Enqueue one research job |
| `get_research` | `jobId` | persisted state + attributed results | Read |
| `get_trends` | `keyword` | historical trend analysis or insufficient history | Read |

MCP server must *not* expose arbitrary HTTP fetch, shell, SQL, universal scraping, secrets, or blanket agent tool execution. Static bearer auth fits private/internal clients but does not automatically provide OAuth discovery for arbitrary public MCP clients; add OAuth in P1.

## 7. Provider contracts

### SerpApi - Amazon listings

- Base: `https://serpapi.com/search.json` with `engine=amazon`, `amazon_domain=amazon.com`, `k=<keyword>`, `page`, `api_key`.
- Read `organic_results` defensively. Exclude or separately mark sponsored results; if sponsored appears inside the array, never count it as an organic trend movement.
- Canonical product key: marketplace + validated ASIN, not title or search position. Keep `position`, numeric price from `extracted_price` if recognized, rating, review count, observation timestamp, canonical Amazon detail URL, provider `serpapi`.
- Unknown fields are `null`; no fake values. On provider errors (quota/HTTP 429/5xx), use bounded retries and fail clearly.
- Use bounded parallelism and per-day provider-credit cap (`MAX_SERPAPI_CALLS_PER_DAY`, starting low) enforced through Upstash Redis **plus provider dashboard hard limits** where available.

### Firecrawl - public source enrichment

- Use official `firecrawl` Node SDK and `scrape(url, { formats: ['markdown'] })` for one explicitly selected public HTTPS page. Do not add broad `crawl` by default.
- URL validation requires HTTPS, rejects IP literals, credentials, and common local/private hostnames, and requests one page. The final Firecrawl URL must also be public HTTPS before persistence. The SDK buffers its response before the application truncates the stored excerpt to 4,000 characters; hostname checks do not independently prove safe DNS resolution or prevent every upstream redirect behavior.
- Never give untrusted web text authority over internal instructions. Persist only source metadata and approved short excerpts, not unbounded crawl output.
- Firecrawl does **not** prove supplier or trademark affiliation.

### Fixture adapter

Returns clearly synthetic products for an end-to-end local/test pipeline. `DATA_MODE=fixture` must be explicit; never automatically change a failing live provider into fixture mode in production.

## 8. Data design requirements

Canonical entities (details in architecture): `ResearchJob`, `Product`, `ProductObservation`, `WorkflowOutbox`, `ProviderUsage`, and `EnrichmentEvidence`. Required state transitions:

`QUEUED -> RUNNING -> SUCCEEDED` or `QUEUED/RUNNING -> FAILED`; `QUEUED -> DISPATCH_FAILED` on enqueue failure; retries are explicitly recorded. `SUCCEEDED`/`FAILED` are terminal for an attempt; operator retry creates a new attempt or job and an audit event.

Uniqueness and indexes: unique `(marketplace, asin)` per product; unique `(jobId, productId)` per observation; indexes support keyword/cohort/status history queries, job status/creation queries, observation history, outbox leases, and provider/evidence retention; unique nullable idempotency key and workflow run ID. All timestamps UTC, financial data decimal in storage and trend math.

Save **normalized** data: do not write full SerpApi responses to PostgreSQL. Every observation carries `provider`, `observedAt`, canonical evidence reference, and `synthetic` flag through its job. Select database limits and retention based on current provider quotas and reviewed data terms.

## 9. Trend mathematics (MVP)

- Products are comparable only for identical marketplace, normalized keyword, page, requested limit, and provider source. The current trend endpoint selects only page 1 / limit 10 jobs.
- For same ASIN observed at time `t0` and `t1`:
  - `rank_improvement = previous_position - current_position` (positive implies observed upward movement).
  - `price_change_percent = ((p1 - p0) / p0) * 100` when both prices valid and `p0 > 0`.
  - `review_count_delta = current_reviews - previous_reviews` when both known. This is **not sales velocity**.
- Missing products are `not_observed_in_sample`, not `discontinued`.
- Never call two observations a statistically significant trend. The current response is `directional_only`; confidence remains `low` until 3 or more compatible snapshots span at least 7 days.
- Never claim search demand, monthly sales or revenue without separately licensed measured data.
- Deterministic numeric scoring optional P1, versioned, visible formula and confidence. AI must not overwrite source observations.

## 10. Workflow and durability contract

`POST /api/research` authenticates + validates + checks Redis quotas -> transactionally creates `ResearchJob` and `WorkflowOutbox` -> attempts QStash/Workflow dispatch -> returns 202 on successful dispatch. A protected five-minute QStash schedule invokes the outbox route to reclaim pending or expired leases and retry with bounded exponential backoff. After eight failed dispatch attempts, the job becomes `DISPATCH_FAILED`. Workflow executes idempotent steps: `start` -> `serpapi_fetch_or_fixture` -> `upsert_results` -> `finish`. Failure callback marks `FAILED` and records a safe diagnostic. Durable step output must be bounded and not include raw large HTML.

- QStash signing keys (`QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`) are mandatory in production. The SDK verifies signed callbacks.
- Trigger from trusted server code only. No direct client call to workflow endpoint.
- `QSTASH_DEV=true` local development only. Production has QStash credentials and accessible public URL.
- Retries with backoff; idempotent database writes, bounded external provider budget and at-least-once execution semantics.
- Do not run infinite timers, `while(true)` or a BullMQ `Worker` within a Vercel Function.
- The outbox and protected QStash Schedule recover the database-to-QStash insert/trigger gap. Daily retention runs through Vercel Cron; on Hobby it is limited to once per day and may be delayed within the scheduled hour. Configure `CRON_SECRET` for both scheduler paths as described in `guide.md`.

## 11. Authentication and abuse limits

- `RESEARCH_API_KEY` minimum 32 random bytes (recommend 64 hex chars) in Vercel secret variables and local ignored `.env`.
- `Authorization: Bearer` required for REST/MCP; constant-time comparison or digest comparison. Never in query strings or browser-exposed `NEXT_PUBLIC_*` variables.
- `GET /api/health` only anonymous endpoint. No unsafe cache for private data; `Cache-Control: no-store` on research outputs.
- Redis atomic rate limits (10 research requests/minute, 60 reads/minute, 5 enrich requests/hour), request body bounds, limit=20 max, provider daily reservations, short fetch timeouts, and structured redacted logs.
- No cross-origin wildcard for authenticated API/MCP. Prevent SSRF in Firecrawl URL input.
- QStash callbacks validated by Upstash signature, not `RESEARCH_API_KEY`.
- Avoid displaying source provider API keys, full connection strings, raw query strings that contain secrets, request bearer tokens or untrusted HTML in logs.
- If accessible by outside customers, move to scoped OAuth/OIDC plus per-tenant authorization before multi-tenancy.

## 12. Environment variables

| Name | Required for | Example/handling |
|---|---|---|
| `DATABASE_URL` | runtime DB operations | Prisma Postgres **pooled** PostgreSQL URL, `sslmode=require` |
| `DIRECT_URL` | migrations/admin | Prisma Postgres **direct** URL; set in local/CI, not needed in Vercel runtime |
| `RESEARCH_API_KEY` | all protected endpoints | generated secret, >=32 bytes |
| `CRON_SECRET` | scheduled recovery and retention | separate generated secret, >=32 bytes |
| `DATA_MODE` | data provider | `fixture` or `serpapi` (`serpapi` production only after review) |
| `SERPAPI_API_KEY` | live mode | secret from SerpApi; never exported |
| `SERPAPI_RIGHTS_PROFILE` | live mode | reviewed data-use profile label stored on each live research job |
| `FIRECRAWL_API_KEY` | `/api/enrich` | secret; omit to disable enrichment |
| `ENRICHMENT_RIGHTS_PROFILE` | enrichment evidence | approved rights/use profile label; required when Firecrawl is enabled |
| `UPSTASH_REDIS_REST_URL` | quotas and budgets | Upstash HTTPS Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | quotas and budgets | secret |
| `QSTASH_TOKEN` | production workflow start | Upstash Workflow/QStash secret |
| `QSTASH_CURRENT_SIGNING_KEY` | production callbacks | Upstash secret |
| `QSTASH_NEXT_SIGNING_KEY` | production callbacks | Upstash secret |
| `QSTASH_DEV` | local only | `true` (never in Vercel production) |
| `APP_BASE_URL` | worker trigger URL | canonical HTTPS deployment domain; local `http://localhost:3000` |
| `MAX_SERPAPI_CALLS_PER_DAY` | budget | `25` initial soft application cap |
| `MAX_FIRECRAWL_CALLS_PER_DAY` | enrichment budget | `5` initial soft application cap |
| `OBSERVATION_RETENTION_DAYS` | retention | `30` proposed, subject to rights review |
| `USAGE_RETENTION_DAYS` | provider usage audit | `365` default; adjust to financial/audit policy |
| `OPENAI_API_KEY` | P1 optional | omitted/OFF initially |
| `AIRTABLE_TOKEN` / `AIRTABLE_BASE_ID` | P1 optional | omitted/OFF initially |

Do not set an `AMAZON_*` credential. Do not commit real `.env` files. Keep `.env.example` with redacted placeholders only.

## 13. Deployment and release process

- **Production target:** Vercel Pro/Enterprise for commercial use. Hobby permitted solely for compliant personal prototypes. Do not claim the entire infrastructure is free.
- **Database:** Prisma Postgres Free, initially 500 MB / 200,000 operations monthly per public pricing at documentation time; verify current limits before launch.
- **Redis:** Upstash Redis Free where usage fits; keep command-based metering in view.
- **Workflow:** Upstash Workflow/QStash managed service with its own quota/pricing; Redis Free does not automatically include unlimited Workflow usage.
- **External APIs:** Firecrawl and SerpApi have independent usage/credit plans. Budget them before live collection.
- **Build:** `npm ci && npm run build`; `prisma generate` on build/postinstall; no migration in runtime routes.
- **Migration:** `npx prisma migrate deploy` with `DIRECT_URL` via a separate authorized CI/manual release step before activating new code. Commit migration files.
- **Deploy:** `vercel --prod` or GitHub -> Vercel project integration. Set all environment variables on Vercel for the proper targets and redeploy after changes.
- **Endpoint hostname:** Set `APP_BASE_URL` to a stable production URL. For initial bootstrap, Vercel's project hostname can be determined after first deployment; configure URL and redeploy before triggering jobs.
- **Region:** Choose Vercel Function region near the Prisma/Upstash region; verify provider geography and latency.
- **Rollbacks:** Vercel deployment rollback does **not** roll back database migrations. Use backward-compatible expand/migrate/contract schema changes.

## 14. CI/CD minimum

PR: `npm ci` -> Prisma validation -> typecheck -> lint -> environment-shape check -> build (fixture mode; no live provider consumption). Automated unit/integration tests are not included in this initial scaffold. Production release: separately authorized schema migration -> build/deploy -> manual smoke checks; if a smoke check fails, rollback a compatible application deployment and investigate data migrations separately. Preview environments use separate databases, queues, and provider quotas if enabled.

## 15. Verification and test plan

| Test | Acceptance |
|---|---|
| Schema | `prisma validate`, initial migration succeeds on fresh Prisma Postgres |
| Typecheck/build | TypeScript strict + `npm run build` green |
| Fixture job | 202 -> SUCCEEDED; synthetic true; products saved exactly once |
| Live research | Only approved SerpApi mode; one bounded keyword call succeeds and is source-attributed |
| Replay | Repeated QStash delivery does not create duplicate observation row |
| Historic data | One run -> `insufficient_history`; two same-query runs -> comparable changes |
| Auth | no token/incorrect token 401 REST and MCP |
| Workflow security | unsigned direct POST to workflow denied in production |
| Firecrawl | any public HTTPS domain accepted; private/local/HTTP URLs rejected |
| Provider errors | 429/5xx propagate safe FAILED status, no fabricated data |
| Quotas | limits produce 429 and no provider spending |
| Production | public health 200, token-auth API works, MCP Inspector can list/invoke tools, job completes |
| Operational | logs trace job ID without secrets; error notification, budget review and backup plan documented |

## 16. 60-minute implementation checklist

- [ ] 0-10 min: prepare Node 24, repository, Vercel (commercial plan if applicable), Prisma, Upstash Redis + Workflow, SerpApi and Firecrawl credentials.
- [ ] 10-20 min: scaffold Next.js, install dependencies, create env, Prisma models/config, initial migration.
- [ ] 20-35 min: implement shared services, fixture + SerpApi adapters, Upstash job endpoint, REST endpoints.
- [ ] 35-45 min: implement MCP tools and Firecrawl bounded enrichment; run typecheck/fixture checks.
- [ ] 45-55 min: configure Vercel secrets, deploy, set canonical URL, migrate, redeploy; check logs.
- [ ] 55-60 min: health, REST, live provider, MCP smoke tests and record results.

**Assumptions:** accounts already approved, CLI authenticated, no procurement/security/legal blockers, one experienced TypeScript developer or competent coding agent, basic prewritten reference source from `guide.md`. If provisioning, billing activation, API approval, DNS, or debug work takes longer, keep the scope; do not weaken security to fit the clock.

## 17. Deferred maturity roadmap

- **M1 (after launch):** scheduled watchlists, retained price/review/rank history, admin requeue, pagination, P95 tracing, synthetic SLO monitors.
- **M2:** methodology-versioned opportunity scores with confidence/selection-bias controls; comparison of search cohorts/categories; structured user reports.
- **M3:** optional AI summaries and Airtable projection with source licensing gates; annotations and human-reviewed evidence.
- **M4:** separate manufacturer qualification module with independent evidence verification and licensed supplier datasets; no unsupported factory assertions.
- **M5:** multi-tenant workspaces, scoped OAuth MCP, usage billing, compliance workflows and region segmentation.

## 18. Completion criteria and non-negotiables

Production acceptance is blocked until all P0 functional tests, `npm run build`, database migration, signed Workflow callbacks, authorization checks and one end-to-end job pass. Firecrawl and SerpApi account activation alone are not proof of legal rights or reliability. The product is **observed Amazon listing intelligence**, not verified unit-sales analytics. Keep all performance, pricing and compatibility assumptions documented and re-checked on the deployment date.

## 19. Official implementation references (check for version updates)

1. Vercel MCP `mcp-handler` v2: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
2. Vercel Functions/Fluid duration: https://vercel.com/docs/functions/configuring-functions/duration
3. Vercel commercial-use terms: https://vercel.com/docs/limits/fair-use-guidelines
4. Prisma Postgres connection URLs: https://www.prisma.io/docs/postgres/database/connecting-to-your-database
5. Prisma Postgres pricing: https://www.prisma.io/pricing
6. Prisma ORM v7+Next.js: https://www.prisma.io/docs/guides/v7/frameworks/nextjs
7. Upstash Workflow on Vercel: https://upstash.com/docs/workflow/quickstarts/vercel-nextjs
8. Upstash Workflow signature verification: https://upstash.com/docs/workflow/howto/security
9. Upstash Redis and BullMQ tradeoffs: https://upstash.com/docs/redis/integrations/bullmq
10. SerpApi Amazon Search: https://serpapi.com/amazon-search-api
11. Firecrawl Node SDK: https://docs.firecrawl.dev/sdks/node
