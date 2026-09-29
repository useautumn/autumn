---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# What alien.dev provides

Source: alien.dev docs (read 2026-09-28) and `#ext-autumn-alien`. Nothing here is verified against
a running alien deployment yet; the open questions at the end are for Alon.

## The mental model

```
 Autumn (vendor)                          one customer's AWS account
 ┌──────────────────────────┐             ┌──────────────────────────────────────┐
 │ alien.ts stack           │  alien      │ isolated area, prefix "autumn-*"     │
 │   Kv("cache")            │ release ──► │   DynamoDB table  (on-demand)        │
 │   Worker("sync")?        │             │   Lambda worker   (if declared)      │
 │                          │             │   IAM role per worker, least-priv    │
 │ alien deployment manager │ AssumeRole  │                                      │
 │ (alien-hosted or ours)   │ + ext id ──►│ manage live resources, telemetry     │
 └──────────────────────────┘             └──────────────────────────────────────┘
      one deployment per customer, id = externalId we pass (our org id)
```

- A **stack** is one `alien.ts`; resources are `live` (alien may replace them on a release) or
  `frozen` (customer setup owns them, a release cannot touch them).
- A **deployment** is one customer's copy. The vendor creates a setup link per customer and the
  customer runs it; `alien release` then rolls new code to every deployment with no customer action.
- The customer's **networking stays closed**: nothing inbound. Alien's own manager reaches the
  account through a cross-account IAM role with an external id.

## The one-click part

The portal is white-labeled and the link is minted from our backend, so the dashboard button is real:

```
 dashboard "Deploy cache"  ─►  POST alien /v1/deployment-groups/setup-links
                                { project, externalId: org_id, name }
                           ◄─  a revocable link, same externalId = same deployment group
 customer opens link       ─►  picks CLI | Terraform | CloudFormation (one-click stack) | Helm
                           ─►  CloudFormation creates the table, roles, service identity
 our backend               ─►  `alien deployments wait <id> --for ready`   (CLI; API equivalent unconfirmed)
```

Catch: no deployment-status webhook is documented. Readiness is polled.

## The KV, concretely

| | |
|---|---|
| AWS backing | DynamoDB, on-demand, 16 hash buckets, TTL deletes within ~48h |
| key | ≤ 512 bytes, charset `a-z A-Z 0-9 - _ : .` |
| value | opaque bytes ≤ **24 KiB** |
| consistency | strong single-key: a `get` after a `set` sees it |
| conditional writes | `ifVersion: null` (create only), `ifVersion: entry.version` (compare-and-set) |
| API | `set / setJson / get / getJson / delete / exists / scan(prefix)`; no batch op |
| declared as | `new alien.Kv("cache").build()`, linked to a worker with `.link(cache)` |

Inside the customer's cloud, code reads it with `kv("cache")` from `@alienplatform/sdk`, or with the
native DynamoDB SDK via `ALIEN_CACHE_BINDING` (JSON with the table name; credentials come from the
worker's IAM role). That env var only exists on alien-managed compute. **The customer's own app**
(their Next.js server, wherever it runs) is not alien-managed compute, so how it gets the table name
and IAM permission is not documented.

## How Autumn's cloud writes to it: three options, none confirmed

Alon, 2026-09-25: "with Dynamo, you `set` with an AWS API call, not with TCP to redis 6379".

```
 A  remote binding      Bindings.forRemoteDeployment({ deploymentId, token }).kv("cache")   ✗ no such method
                        @alienplatform/bindings 3.3.25 remote.d.ts:55-66 exposes storage, key, ai, sandbox;
                        POST /v1/projects/{id}/remote-bindings/access capability enum = ["storage","sandbox"]
 B  command → worker    CommandsClient.forDeployment({ deploymentId, apiKey }).invoke("set-entries", {...})
                        a Lambda in the account, linked to the Kv, does kv.set; documented, sync, at-least-once
 C  cross-account STS   our backend assumes a role in the account and calls DynamoDB directly
                        not offered: the vendor gets code-deploy access only (permissions doc)
```

Alon, 2026-09-28 (thread `p1790608664202409`): **no Lambda**. Two ways, both from our backend:

```
 1  remote binding   Bindings.forRemoteCustomer({ project:"autumn", externalId: org.id, token })
                       .kv("check-cache").setJson(key, snapshot, { ttl: 86400 })
                     straight to DynamoDB, creds refresh themselves; same code on GCP/Azure
 2  KV Gateway       PUT https://api.alien.dev/v1/kv/items
                     headers: bearer token, x-alien-external-id: org.id
                     body: { resourceId:"check-cache", key, value, ttl, sourceVersion }
                     retries, rejects out-of-order writes by sourceVersion, keeps a write log
                     (keys, not values); deployable inside Autumn's cloud
```

Catch: neither is in the published `@alienplatform/bindings` 3.3.25 typings (remote: storage,
key, ai, sandbox only) or in `alien.dev/openapi.json` (no `/v1/kv` path) as of today. Treat both
as pre-release; confirm the version that ships them before unit 1.

Alon's 2026-09-15 prototype diff (screenshot in `#ext-autumn-alien`, files
`server/src/internal/localCache/localCacheGateway.ts`, `queueLocalCacheSync.ts`,
`syncLocalCacheSnapshots.ts`, `buildCheckSnapshot.ts`, and `packages/sdk/src/local-cache/kv-reader.ts`)
was built against the pre-worker server: a check queued an SQS job that built a snapshot and pushed
it through a "gateway". Which of A/B/C the gateway used is not visible in the screenshot.

Ayush chose "serverless cache" over Redis on 2026-09-28; Alon is building that.

## What this fixes for the design

- A value is ≤ 24 KiB, so the unit stored must be small: per feature or per subject, never a whole
  customer with entities.
- No batch write: one `set` per key per push. A track that touches one feature is one `set`.
- Compare-and-set exists, so a stale push (older revision landing after a newer one) can be refused
  at the KV without a lock.
- TTL exists, so an entry can expire by itself at the feature's next reset.

## Questions for Alon

1. ~~Which of A/B/C~~ Answered: remote binding or KV Gateway. Still open: which SDK / API version
   ships them, and the write rate ceiling per deployment.
2. Is there a REST equivalent of `alien deployments wait --for ready`, or a webhook, so the dashboard
   can flip "connected" without polling from a cron?
3. How does the customer's own application (not alien-managed compute) get the DynamoDB table name
   and read permission? Is that the CloudFormation output plus an IAM policy the customer attaches?
4. Does `setupLinks.create` work on the alien-hosted manager, or does Autumn need to self-host the
   manager (the self-hosting page reads as if self-hosting is the default)?
5. One deployment per org, or per (org, env)? Sandbox customers pushing into a live table would be a
   mistake we cannot undo from our side.
