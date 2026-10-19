# Amazon Market Intelligence - Build and Release Guide

**Updated:** 2026-10-19 | **Status:** repository scaffold and application implementation are present. External accounts, secrets, database migration, QStash schedule registration, and deployment remain operator steps.

This guide covers setup and release of the checked-in application. Product constraints are in [spec.md](./spec.md); system boundaries and data flow are in [architecture.md](./architecture.md). Do not follow the old copy/paste scaffold sequence from earlier revisions: project files now live in the repository.

## 1. What is implemented

- Next.js App Router application for Vercel, TypeScript, security headers, CI, and locked npm dependencies.
- Authenticated REST and MCP surfaces backed by shared service functions.
- Prisma Postgres schema and SQL migrations for jobs, products, observations, manufacturer candidates, a workflow outbox, provider usage, and linked enrichment evidence.
- Upstash Redis atomic request limits and UTC daily provider budget counters. Paid operations fail closed if Redis is missing or unavailable.
- QStash/Workflow signed callback processing, idempotent persistence, a QStash-scheduled five-minute outbox reconciler, and daily retention cleanup.
- Synthetic fixture mode and bounded SerpApi Amazon Search adapter. There is no silent live-to-fixture fallback.
- Firecrawl web search for up to five candidates per saved non-synthetic product, disabled by default; results stay unverified and search never crawls or scrapes candidates.
- Firecrawl single-page enrichment restricted to approved HTTPS domains and a recorded rights profile.
- A responsive API landing page. It does not show secrets or claim live observations.

The repository is deployment-ready; it is not deployed. No cloud credentials, data-use approval, production migration, or production smoke-test results are present here.

## 2. Required accounts and approvals

Create or identify:

1. A development and production Prisma Postgres database, with pooled and direct connection URLs for each environment.
2. Upstash Redis REST credentials and Upstash Workflow/QStash credentials, including current and next signing keys.
3. A Vercel project and a stable HTTPS production hostname. Use a plan that permits the intended commercial traffic.
4. A SerpApi account only if Amazon listing collection, storage, and use have been reviewed and approved.
5. A Firecrawl account only after approving search-result snippet use and storage; approve each domain separately before reading and storing candidate-page content.

Review each provider's current price, quotas, retention terms, and rights before live collection. Provider access alone does not grant permission to store, process, export, or republish data. Keep `DATA_MODE=fixture` until live use is approved. `SERPAPI_RIGHTS_PROFILE` is an audit label; it does not replace the review.

## 3. Environment configuration

Copy the placeholder file and generate two different secrets:

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Set `RESEARCH_API_KEY` to the first value and `CRON_SECRET` to the second. Do not commit `.env`, paste secrets into logs, or define API keys as `NEXT_PUBLIC_*` variables.

| Variable | Needed for | Local / production handling |
|---|---|---|
| `DATABASE_URL` | Runtime persistence | Pooled Postgres URL; TLS enabled |
| `DIRECT_URL` | Migrate/admin | Direct Postgres URL; required by `db:migrate`, `db:deploy`, and `db:status` |
| `RESEARCH_API_KEY` | Protected REST and MCP | At least 32 random bytes |
| `CRON_SECRET` | Scheduled maintenance routes | A separate secret of at least 32 random bytes; pass it to QStash as a forwarded `Authorization` header for outbox reconciliation |
| `APP_BASE_URL` | QStash callback target | Local `http://localhost:3000`; stable HTTPS production URL |
| `DATA_MODE` | Listing source | `fixture` or `serpapi`; use `fixture` until approval |
| `SERPAPI_API_KEY` | Live Amazon search | Server-only; no logging of URLs containing the key |
| `SERPAPI_RIGHTS_PROFILE` | Live-data audit | Approved collection/storage/use profile label; required when `DATA_MODE=serpapi` |
| `FIRECRAWL_API_KEY` | Optional search/enrichment | Server-only; required to call Firecrawl |
| `FIRECRAWL_SEARCH_ENABLED` | Manufacturer search | Defaults to `false`; set `true` only after search/snippet use and budget are approved |
| `APPROVED_ENRICHMENT_DOMAINS` | Candidate-page enrichment | Comma-separated HTTPS hostnames approved for page collection/storage; no wildcards |
| `ENRICHMENT_RIGHTS_PROFILE` | Search and evidence audit | Reviewed use-profile label required with Firecrawl; the label does not grant rights |
| `UPSTASH_REDIS_REST_URL` | Limits and budgets | HTTPS REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Limits and budgets | Secret token |
| `QSTASH_TOKEN` | Production dispatch | Required outside local development mode |
| `QSTASH_CURRENT_SIGNING_KEY` | Callback verification | Required in production |
| `QSTASH_NEXT_SIGNING_KEY` | Callback key rotation | Required in production |
| `QSTASH_DEV` | Local Workflow mode | `true` locally; unset in production |
| `MAX_SERPAPI_CALLS_PER_DAY` | SerpApi soft budget | Defaults to `25`; set a lower launch cap if appropriate |
| `MAX_FIRECRAWL_CALLS_PER_DAY` | Firecrawl soft budget | Defaults to `5` |
| `OBSERVATION_RETENTION_DAYS` | Research/evidence retention | Defaults to `30`; choose a rights-approved value |
| `USAGE_RETENTION_DAYS` | Provider audit retention | Defaults to `365` |

Redis counters are application-side guards, not billing guarantees. Configure provider-side spending controls where available.

## 4. Local development

Use Node.js 24 (the repository includes `.nvmrc`) and npm. Use development-only database, Redis, and QStash values.

```bash
nvm use
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

`db:migrate` requires `DIRECT_URL` and applies the initial migration to the development database. With `QSTASH_DEV=true`, `@upstash/workflow` uses the local QStash server and tries to start it on the first workflow dispatch (default: `127.0.0.1:8080`). Keep `npm run dev` running so the local Workflow server can call the Next.js callback at `APP_BASE_URL` (`http://localhost:3000`). If the dispatch returns `503` because the SDK did not start its server, use the manual fallback below in a second terminal.

If the SDK cannot download or start its server, start it manually in a second terminal with `npx @upstash/qstash-cli dev`, then retry the workflow request. The CLI is a fallback; it is not required for the normal local setup.

The fixture path still depends on Postgres, Redis, and Workflow. It does not contact SerpApi or Firecrawl. The anonymous health route reports process liveness only and does not probe those dependencies.

Available repository checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run env:check
npx prisma validate
```

`npm test` runs deterministic simulated-provider cases for manufacturer search. CI still runs schema/static/build checks and does not call live APIs or databases.

## 5. API usage

Every protected request sends `Authorization: Bearer $RESEARCH_API_KEY`. Responses are not cacheable. Errors use the stable shape `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Anonymous liveness response |
| `POST` | `/api/research` | Queue a keyword observation; optional `Idempotency-Key` |
| `GET` | `/api/research/{jobId}` | Read job state, source, synthetic flag, observations, and provenance |
| `GET` | `/api/trends?keyword=...` | Compare compatible page 1 / limit 10 observations |
| `POST` | `/api/manufacturers/search` | Search at most five results for a saved, non-synthetic ASIN; disabled unless `FIRECRAWL_SEARCH_ENABLED=true` |
| `POST` | `/api/enrich` | Store one bounded excerpt from an approved site or a selected candidate |
| `GET`, `POST` | `/api/mcp` | Authenticated MCP: `research_products`, `get_research`, `get_trends` |

Submit a synthetic job:

```bash
curl -i -X POST http://localhost:3000/api/research \
  -H "Authorization: Bearer $RESEARCH_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-portable-blender-001' \
  -d '{"keyword":"portable blender","marketplace":"amazon.com","page":1,"limit":10}'
```

Poll the returned `statusUrl` until it is `SUCCEEDED` or a terminal failure. The fixture is marked `synthetic: true`. A single successful snapshot returns `insufficient_history`; later compatible snapshots yield directional-only signals. Rank movement is not a verified demand or sales measure.

Manufacturer search accepts `{"asin":"<saved non-synthetic ASIN>"}`. Each returned candidate includes its search title, URL, snippet, source, and `relationshipVerified: false`. Pass a returned candidate `id` to `/api/enrich` as `{"candidateId":"..."}`; the existing approved-domain and rights-profile checks apply before content is fetched and stored. Search snippets and page text do not prove who manufactured the product.

Before switching to SerpApi, set `DATA_MODE=serpapi`, configure the key and a conservative daily cap, submit a new job with a new idempotency key, then review provider billing and data-use terms. Provider failures remain visible as failures; they never produce fixture results.

For MCP, use a Streamable HTTP client at `/api/mcp` and configure the same bearer token. The static key is appropriate only for a trusted private integration; this scaffold does not issue OAuth tokens or provide multi-tenant isolation.

## 6. Database migrations

The checked-in initial migration is `prisma/migrations/20261015220000_init/migration.sql`.

- Development: `npm run db:migrate` (`prisma migrate dev` with `DIRECT_URL`).
- Production: `npm run db:deploy` (`prisma migrate deploy` with the production `DIRECT_URL`).
- Status: `npm run db:status`.
- Client generation/build: `npm run db:generate`; the production build also generates the client.

Never run `migrate dev` or `db push` against production. Never edit an applied migration. Apply additive migrations before deploying code that reads the new schema. Runtime functions use pooled `DATABASE_URL`; keep direct migration credentials out of ordinary Vercel runtime settings.

## 7. Vercel production release

1. Create separate production Prisma, Redis, QStash, and provider resources. Select a Vercel region close to Postgres/Redis.
2. Set production Vercel environment variables from the table above. Keep `QSTASH_DEV` absent, `DATA_MODE=fixture`, and paid provider keys absent unless approved.
3. Choose a stable Vercel hostname or custom domain and set `APP_BASE_URL` to its HTTPS origin. QStash must reach `/api/workflows/research`; deployment protection must not block that signed callback.
4. From an authorized release environment with the production `DIRECT_URL`, run `npm run db:deploy` before directing production traffic to the new schema.
5. Deploy through the Vercel project integration or `npx vercel@latest --prod`. The build runs Prisma client generation and `next build`; it does not run migrations.
6. Set `CRON_SECRET` in the Vercel project. `vercel.json` schedules `/api/cron/retention` daily, which is supported on Hobby (with up to an hour of timing variance). For the five-minute outbox recovery schedule, create a QStash Schedule in the Upstash Console:
   - Destination: `https://YOUR_PRODUCTION_HOSTNAME/api/cron/outbox`
   - Method: `GET`
   - Cron: `*/5 * * * *` (QStash evaluates schedules in UTC by default)
   - Forwarded header: `Authorization: Bearer YOUR_CRON_SECRET` (configure as `Upstash-Forward-Authorization`)
   - Retries: use QStash's delivery retries; the outbox handler is lease-protected and safe to invoke more than once.
   Keep the QStash schedule pointed at the stable production hostname and verify its deliveries after setup. Vercel Hobby supports cron jobs only once per day, with up to 59 minutes of timing variance; more frequent Vercel cron expressions fail deployment. QStash free tier currently lists 1,000 messages/day, so include scheduled deliveries, retries, and workflow traffic in usage planning.
7. Confirm `APP_BASE_URL` points to the production hostname and redeploy if it changed. Verify the callback is reachable without bypassing QStash signature checks.
8. Run the production checks below with a fixture job. Only then enable a reviewed live provider and its secret/budget.

Before deploy, run `npm run env:check:production` with the production environment loaded. It validates required values without printing secrets or contacting services.

Commercial deployments must use a Vercel plan permitted for commercial use. Vendor pricing, quotas, regional availability, backup features, and legal terms can change; verify them before release.

## 8. Production acceptance checks

```bash
export BASE_URL='https://YOUR_PRODUCTION_HOSTNAME'

curl -i "$BASE_URL/api/health"

# Protected route must reject a missing token.
curl -i "$BASE_URL/api/trends?keyword=portable%20blender"

# Queue a fixture observation using a real secret held in your terminal environment.
curl -i -X POST "$BASE_URL/api/research" \
  -H "Authorization: Bearer $RESEARCH_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: production-fixture-001' \
  -d '{"keyword":"portable blender","marketplace":"amazon.com","page":1,"limit":10}'
```

Then confirm all of the following:

- Job reaches `SUCCEEDED`, contains fixture products, and is marked synthetic.
- Repeating the same idempotency key does not create a second job.
- Wrong/missing credentials return 401 on REST and MCP.
- MCP `tools/list` returns exactly the three documented tools.
- Direct unsigned POST to `/api/workflows/research` is rejected.
- Unknown, HTTP, IP, localhost, private-name, and non-allowlisted URLs are refused by `/api/enrich`.
- Outbox and daily retention cron routes reject requests without `CRON_SECRET`.
- QStash shows the signed workflow callback; provider usage, result provenance, and configured retention appear as expected.
- Redis or provider outages do not bypass rate limits or switch live jobs to fixtures.

Health is not readiness: it intentionally returns 200 without database/provider checks and must not disclose secrets.

## 9. Operations and recovery

| Symptom | Operator action |
|---|---|
| Job remains `QUEUED` | Check QStash token, stable `APP_BASE_URL`, callback reachability, Vercel protection, and `/api/cron/outbox` logs. The transactional outbox retries dispatch with backoff. |
| Job becomes `DISPATCH_FAILED` | Inspect the safe outbox error/status and QStash console. Submit a new job with a new idempotency key after fixing configuration; do not claim the old job was researched. |
| Job becomes `FAILED` | Check QStash run/failure logs and provider usage status. Do not expose raw provider responses or URLs containing credentials. |
| Redis is unavailable | Paid submissions/enrichment fail closed. Restore Redis before accepting paid work. |
| Provider budget is reached | Review provider-side quota, application counter and planned spend; reduce load or adjust caps deliberately. |
| Database pool pressure | Verify pooled `DATABASE_URL`, keep one lazy Prisma client per warm function, reduce concurrency, inspect query/operation volume. |
| New release needs schema change | Use backward-compatible expand/migrate/contract. A Vercel rollback does not reverse database changes. |

The daily retention task deletes terminal research jobs and their observations after `OBSERVATION_RETENTION_DAYS`, old enrichment evidence at the same horizon, old provider usage entries after `USAGE_RETENTION_DAYS`, and orphan products. On Vercel Hobby it may run at any time within the scheduled hour; cleanup is idempotent and overdue records are removed on the next successful invocation. Confirm the configured period matches provider terms and policy. Configure encrypted backups and test restores; managed backup availability depends on the selected database plan.

## 10. Current boundaries and follow-up work

- Static bearer auth is single-tenant and not a public OAuth solution.
- No watchlist scheduler, sales-volume data, broad crawling, AI summary, or Airtable export is enabled.
- Application budget counters do not guarantee a provider bill cap. Set provider-side caps where available and review usage.
- Firecrawl search shares the daily provider budget with page enrichment; each bearer client can make at most five combined search/enrichment calls per hour. Keep search disabled until snippet use and storage are approved, and approve each candidate domain before page enrichment.
- Firecrawl's SDK returns a single-page response that is truncated before persistence, but the SDK buffers the provider response before the application slices the excerpt. Keep domains tightly approved and verify provider response controls for the selected account.
- Provider terms and retained evidence require human review; `rightsProfile` is an audit label, not legal approval by itself.
- Add unit/integration and deployment smoke automation before opening the service to external customers.

## 11. Primary implementation references

- [Vercel MCP handler and authorization](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel)
- [MCP TypeScript SDK v2 tool registration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md)
- [Prisma ORM v7 PostgreSQL and driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- [Upstash Workflow with Next.js](https://upstash.com/docs/workflow/quickstarts/vercel-nextjs)
- [Upstash Workflow trigger](https://upstash.com/docs/workflow/basics/client/trigger)
- [Upstash Workflow signing](https://upstash.com/docs/workflow/howto/security)
- [Firecrawl Node SDK](https://docs.firecrawl.dev/sdks/node)
- [SerpApi Amazon Search API](https://serpapi.com/amazon-search-api)
