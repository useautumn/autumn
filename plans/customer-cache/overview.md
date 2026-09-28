---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: ready-for-review
---

# Customer cache: a KV in the customer's cloud, fed off the balance log

An org clicks "Deploy cache" in the dashboard; alien.dev stands up a DynamoDB table in the org's
AWS account; from then on every balance mutation for that org lands there as a precomputed check,
and the org's app reads it through autumn-js without a round trip to Autumn.

## What's inside

- `data-model/what-alien-provides.md` — the one-click flow, the KV's limits (24 KiB values, CAS,
  TTL, no batch), and the three ways Autumn's cloud might write to it, none confirmed.
- `data-model/what-the-log-record-carries.md` — one track as it lands on the metering topic; no
  balances, no catalog, no checks on it; Kafka is answered before Postgres.
- `data-model/what-a-check-decides.md` — a check is a deduction dry-run; the worker returns a
  verdict plus the rows; the SDK's React hook already checks locally with a weaker rule.
- `data-model/how-an-org-owns-external-infra-today.md` — dedicated org Redis (the sibling),
  integrations tabs, Svix app per env, edge configs, encryption.
- `code-paths/how-herald-runs-a-job.md` — a job is a folder plus one line; `cache-push` exists and
  pushes nothing; herald has no worker client yet.
- `code-paths/how-a-check-is-answered-today.md` — SDK → server → worker → rendered balance, and
  the SDK hook points.

## The five facts the design inherits

```
 1  the record is deltas          "which features moved" is on a track; the rows and catalog are not
 2  the worker is the truth        readSubjectState / check reply = state + catalog, at or past the record
 3  herald is the tail             cache-push is already a job there, with catalog LRU and edge configs
 4  the KV is small and CAS-able   ≤ 24 KiB per value, compare-and-set, TTL, one set per key
 5  per-org infra = org column     redis_config / svix_config / processor_configs, encrypted, clearOrgCache
```

Already decided upstream (`plans/herald/effects-on-the-log.md`, 2026-09-24): the cache-push job
reads the worker's `readSubjectState`, not the log, and the worker is not touched.

## Hard requirements (John, 2026-09-28)

- **As few customer steps as possible.** Floor: one "Create stack" click in AWS, and the app's IAM
  role allowed to read the table (passed as a stack input, or one policy statement as fallback).
  The customer never sees alien, deployment ids, table names or env vars; the SDK self-configures.
- **Setup is API/MCP first.** `byoc.create_cache` returns everything an agent needs (template URL
  + parameters, branded CLI one-liner, setup token); `byoc.get_cache` polls readiness and, once
  ready, returns the table and region the SDK boots off; `byoc.delete_cache` tears down. The
  dashboard button is one caller of `byoc.create_cache`. An ax-evals case proves an agent can do
  it end to end.

## What is still unknown

| # | question | who |
|---|---|---|
| 1 | ~~How Autumn's cloud writes into the KV~~ Decided 2026-09-28: the remote binding, `Bindings.forRemoteCustomer(...).kv("check-cache")`, straight to DynamoDB; no alien API on the write path. Open: the SDK version that ships remote `kv`, and DynamoDB write ceiling per table | Alon |
| 2 | How the customer's own app (not alien-managed compute) learns the table name and gets read permission | Alon |
| 3 | REST readiness signal for a deployment (webhook, or poll `deployments wait`) so the dashboard can flip to "connected" | Alon |
| 4 | One deployment per org, or per (org, env) | John |
| 5 | Herald reading from the worker: budget per read, and whether the read should be `check` per touched feature or one `readSubjectState` per subject | John |
| 6 | The value stored: a per-feature verdict + headroom (24 KiB fits), or the subject's `ApiCustomer` (does not fit for entities) | John, after 1 |

Next: John reviews (`bun brief`); corrections folded in; then `units.md`.
