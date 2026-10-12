# Tinybird Local: build, seed, verify, reset

Builds `server/tinybird` into a Tinybird Local (or any Tinybird Local-compatible API URL, such as a QA env's tunnel) and fills it with deterministic synthetic events. Everything goes over HTTP, so no `docker exec` is needed.

Run from `server/`:

```sh
docker run -d -p 7181:7181 --name tinybird-local tinybirdco/tinybird-local:latest
bun tb:local build                 # datafiles -> workspace "dev"
bun tb:local seed                  # default preset: 2M events over 92 days, verified
bun tb:local seed --preset all --org org_edge --events 300000
bun tb:local verify --org org_seed # rollups vs raw for one org/env
bun tb:local reset                 # truncate every events* datasource (all orgs)
```

`bun tb:local` is `bun tinybird/scripts/local/tbLocal.ts`.

## Target

| Flag | Env | Default |
| --- | --- | --- |
| `--url` | `TB_LOCAL_URL` | `http://localhost:7181` |
| `--token` | `TB_LOCAL_TOKEN` | resolved from `<url>/tokens` |
| `--workspace` | `TB_LOCAL_WORKSPACE` | `dev` (created if missing) |

Without `--token`, the workspace token comes from Local's `/tokens` endpoint, so a URL is enough for a Local behind a tunnel. Hosts ending in `tinybird.co` are refused: these commands write and truncate data.

## build

Generates the resources in memory with the `@tinybirdco/sdk` (same as `bunx tinybird build`), drops the datafiles that need secrets Local doesn't have (Postgres backfill copies, the S3 sink and its connection), and POSTs the rest to `/v1/build`. The checkout is never modified, so `git status` stays clean. Retries while Local is still warming up (`502` right after `/tokens` answers). Run it again after editing datafiles. It builds whatever is in the working tree, branch name irrelevant.

## seed

Inserts events for `--org` (default `org_seed`), `--env` (default `sandbox`) and `--features` (comma-separated feature ids, default `api_calls,ai_credits,emails`, weighted 1, 1/2, 1/3, ...). Pass the org id, env and feature ids of the org you're testing in the dashboard.

- **Deterministic.** Every field of event `i` is a hash of `(--seed, i)`, so the same args produce identical rows (the verify step prints a data fingerprint to compare runs). The window is `[--end - --days, --end)`; `--end` defaults to the start of the current UTC hour, so pass `--end` to reproduce a run on a later hour.
- **Idempotent.** Event ids are `seed_<run>_<i>`, where `<run>` hashes the generation args. Rerunning the same args inserts nothing; an interrupted run resumes the missing batches. A different run for an org/env that already holds seed data is refused unless you `reset` or pass `--allow-other-runs`.
- **Verified.** After inserting, it checks raw `count()`/value against `events_customer_hourly_mv`, daily, monthly, `events_org_hourly_mv`, `event_names_mv`, the org dimension rollups (customer, plan, entity), every property rollup per key (with the value-shape gate read from `events_property_mv_pipe.pipe`), both coverage rollups, and the totals of `aggregate_simple` / `aggregate_groupable` calls. `--no-verify` skips it.
- `--dry-run` generates and prints the summary without touching Tinybird.

Default preset: 2M events, 5,000 customers with a power-law skew (`--customers`, `--customer-skew`), two plan ids (plus none on a third), 10% null values, properties `region` (4 values) and `model` (8 values, absent on 15%), sent through the Events API in 50k-row batches (`--batch-size`, `--concurrency`).

### Edge-case presets

Combine with commas (`--preset whales,high-card`); `all` turns on every one. An explicit flag overrides its preset.

| Preset | Flag | Adds |
| --- | --- | --- |
| `whales` | `--whales 3 --whale-share 0.6` | 3 customers holding 60% of events |
| `entities` | `--entity-share 0.4` | `entity_id` on 40% of events, 5 entities per customer |
| `high-card` | `--high-card 300000` | `path` property with ~300k distinct values (passes the rollup gate) |
| `id-props` | `--id-props` | `trace_id` (UUID) on every event and `job_id` (24 hex) on half: present in coverage, dropped by the property rollup gate |
| `values` | `--values` | half the events get 0, 2.5, 10, 100, -1, -7.25, 0.001, 1e6 or null |
| `small-batches` | `--small-batches 100000 --small-batch-size 500` | the last 100k events as 200 separate inserts (Datasources API, one request = one insert), so rollups hold unmerged duplicate keys |
| `live-hour` | `--live-hour 5000` | 5k events in the first minute of the current hour (waits until that minute has passed) |
| `half-hour-tz` | `--half-hour-tz 20000` | 20k events exactly on +5:30, +5:45 and -3:30 day/hour edges (e.g. 18:29:59.999999 and 18:30:00 UTC) |

`live-hour` and `half-hour-tz` events are added on top of `--events`.

Measured on a 2-CPU machine: build ~4s; default seed ~100s (~20k rows/s, bound by Local's materialized views); `small-batches` adds ~90s.

## reset

Truncates `events` and every rollup fed from it (`events_*`, `event_names_mv`) for all orgs. Truncating `events` alone leaves the rollups full.
