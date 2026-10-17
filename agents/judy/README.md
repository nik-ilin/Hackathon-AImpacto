# Judy: canonical research funding ingestion

Judy collects BDNS, EU Funding & Tenders and UCM OTRI sources into the existing Supabase catalog. It does not perform eligibility matching. Records are `opportunities(opportunity_type=research_funding)` plus `funding_details`; `opportunity_versions` records factual changes. Identity is `(source_id, external_id)`. BDNS/EU use official identifiers; UCM/private pages require a unique HTTPS official link, hashed independently of the title. Ambiguous listing-only cards are skipped.

The original `sql/001_judy_funding_sources.sql` is **legacy reference only**. Do not execute it, copy it to migrations or create `funding_opportunities`. The application migrations under `../../supabase/migrations/` are authoritative and must be applied in order by an authorized operator.

## Reproducible local checks

Node 24; install the pinned lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run collect -- --dry-run --sources bdns,eu,ucm --max 20 --out data
```

Tests use checked-in source fixtures, simulated providers and the actual canonical migrations in PGlite. PGlite does not replace Auth/PostgREST or independent-connection concurrency tests. A dry run can contact real public sources; it never persists. This integration has not been executed against the hosted Supabase or paid providers.

Persisting is the default. Missing Supabase credentials fails before any source or paid API call. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or server-only `SUPABASE_SECRET_KEY`) in the process environment, then run:

```sh
npm run collect -- --request-id operator-20261017-001 --sources bdns,eu,ucm --out data
```

No `.env` is loaded automatically. Never put privileged keys in `VITE_`, browser code or Make. Source defaults exclude the optional `private_web`; enable it explicitly only after reviewing terms/provider costs and configuring Firecrawl or the Claude fallback. No credentials were created or modified by this integration.

## Durable API contract

All ingestion RPCs are service-only: `judy_begin_run`, `judy_renew_run`, `judy_upsert_opportunities`, `judy_finish_run`, `judy_get_run`. `request_id` binds immutable trigger and normalized collection parameters. The database admits one running Judy job globally, issues a 10-minute lease token and fences expired owners. The runner renews every minute and before persistence. Immutable batch keys make a lost HTTP response safe to retry. A duplicate live or terminal request never starts collection again. An expired request becomes `failed`/`partial`; a new explicit request ID is required for a fresh collection.

Terminal statuses are `completed`, `partial`, `failed`; `running` is nonterminal. Source failures remain in the report. CLI exits nonzero for partial/failed/running duplicate responses; explicit dry runs with source errors also exit nonzero. Empty successful collections still record a durable completed run. `data/run.json` is a summary for orchestration; source reports are review artifacts, not automatic notifications.

Source metadata is retained in `funding_details.raw` and source URLs. EU beneficiary categories are unknown unless explicitly supplied by the source. An internal UCM OTC deadline is never substituted for the official deadline. Private extraction is untrusted: only titles and unique links are retained as facts. A shared listing cannot bind its dates, amounts, currency, beneficiaries or summary to an individual call. Those proposals remain only in explicitly unverified raw metadata; persisted dates/amounts/currency are null, beneficiaries empty, summary equals title and status is unknown until item-specific evidence is implemented. These unknown records are hidden by catalog RLS. `eligible_beneficiaries` is source information, never a confirmed user eligibility decision. HTTPS is required for stored source URLs.

## Preferred Make orchestration: Actions, no permanent server

Workflow `.github/workflows/judy.yml` runs daily at 05:15 UTC or by dispatch. It uses `npm ci`, contents-read permissions and a serial concurrency group. Operator deployment/secret configuration and default-branch workflow registration are still required; no workflow was dispatched or deployed here.

Make sends (with its own narrowly scoped GitHub Actions token, never Supabase credentials):

```http
POST https://api.github.com/repos/nik-ilin/Hackathon-AImpacto/actions/workflows/judy.yml/dispatches
Authorization: Bearer <GITHUB_ACTIONS_TOKEN>
Accept: application/vnd.github+json
Content-Type: application/json

{"ref":"<authorized-deployed-branch>","inputs":{"request_id":"make-20261017-batch001","sources":"bdns,eu_funding_tenders,ucm_otri","since_days":"120"}}
```

Dispatch HTTP204 means accepted, not completed. Store the generated request ID before dispatch and reuse it on retries. Find the run by workflow/ref and display title `Judy <request_id>`, poll its Actions status until completed, then inspect conclusion and artifact `judy-run-<github.run_id>/run.json`. A failed job can mean partial ingestion; inspect the durable summary/report, and alert once per request ID + terminal status. Respect GitHub Retry-After/rate limits. Do not treat a workflow failure or absence of artifacts as successful persistence. The handoff document contains the full orchestration blueprint.

## Optional server (only on an explicitly managed trusted host)

`npm run serve` binds 127.0.0.1:8787. Configure persistence and a `JUDY_API_KEY` of at least 24 characters. Any public exposure requires an operator-managed HTTPS reverse proxy. No hosting was provisioned. All routes, including health, require `x-judy-key: <JUDY_API_KEY>`. `MAKE_CALLBACK_URL` refuses startup: unsigned callbacks are disabled; use polling.

- `POST /run`: JSON `{request_id,sources?,sinceDays?,maxPerSource?}`. `request_id`: 8..128 safe letters/digits/`_.:-`; `sources`: comma string; limits: integer days1..365, max1..1000.
- `GET /runs/<request_id>`: durable status survives process restart; no in-memory run registry. `GET /health`: process health only.
- 202 running, 200 completed, 207 partial, 500 failed; 400 invalid input, 401 invalid token, 404 missing run/route, 409 immutable request conflict, 429 global busy (`retry_after:60`), 503 unavailable persistence.
- Successful run responses include `run_id,status,created,updated,unchanged,stats,errors,skipped` as available. Lease tokens are never returned to Make. Retrying the same request does not duplicate collection/writes. Protect and rotate the server key operationally; no callback credentials are needed.
