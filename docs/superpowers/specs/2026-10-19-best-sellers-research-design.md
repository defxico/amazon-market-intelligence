# Best Sellers product research

## Goal

New live keyword research must list Amazon products using its Best Sellers sort, so the first stage has a stated popularity criterion. This ranking does not report sales counts or search volume.

## Data flow

`POST /api/research` keeps its existing request shape and budgets. A new live job stores `searchRanking=best_sellers`; fixture jobs and historical rows use `featured`. The workflow passes the saved ranking to the SerpApi Amazon Search request. Best Sellers maps to `s=exact-aware-popularity-rank` as documented by SerpApi. `GET /api/research/{jobId}` returns the stored ranking. The demo labels each job according to its returned ranking.

## Compatibility and failure behavior

An additive migration defaults existing rows to `featured`, so their old results are never relabeled. Trend comparison requires matching ranking as well as keyword, provider, page, and limit. Provider failures still follow the current job error path and budget accounting. No extra provider request is needed for a job.

## Verification

Check generated SerpApi URL for both ranking modes without calling the provider. Run tests, typecheck, lint, Prisma validation, and builds. Deployment requires the additive migration before the API release, followed by the demo release.
