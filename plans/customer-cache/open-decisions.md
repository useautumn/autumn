---
author: john + claude
feature: customer-cache
date: 2026-09-30
status: living-list
---

# Atom: open decisions

Things we chose not to build yet, each needing a conscious decision before Atom serves real
traffic. Cross the item out (with the decision) rather than deleting it.

## Correctness of a locally answered check

| # | gap | what happens today | options | decided |
|---|---|---|---|---|
| 1 | reset due | Atom answers from the last-pushed balance after a cycle ends, until the API resets and pushes | forward when `resetMayBeDue` (move it from balance-worker to the engine); or Atom projects the reset locally | parked 2026-09-30 |
| 2 | auto top-up | the API's plain check dispatches a top-up at the threshold; Atom's doesn't | forward when `subjectToAutoTopupTriggers` is non-empty (`@autumn/auto-topup`, reads the WorkerFullSubject Atom holds) | parked 2026-09-30 |
| 3 | failed push leaves a stale balance | herald pushes a subject once; on failure it logs and commits the offset | bounded retries (same helper as catalog); periodic per-org reconcile that re-pushes every stored subject; never hold the offset (blocks the partition for everyone) | parked 2026-09-30 |
| 4 | ~~same-ms `read_at` tie~~ | two heralds (blue/green switch) reading one customer in the same ms could land out of order and the older won | the stored `log_offset` breaks the tie | fixed 2026-09-30 |
| 5 | ~~catalog compare + replace across processes~~ | `set` compared `read_at` then replaced in separate transactions; two processes could interleave | both inside one `BEGIN IMMEDIATE` | fixed 2026-09-30 |
| 6 | ~~custom licenses in the shared catalog~~ | `sharedCatalogRowsSql` passed every `plan_license` id, `is_custom = true` rows included | the shared query now skips them; the customer's push carries its own | fixed 2026-09-30 |

## Deployment and operations

| # | gap | options | decided |
|---|---|---|---|
| 7 | Autumn → Atom over the public LB | today: HTTPS + `x-atom-token`. Alien Commands are poll-only for Containers (5 s lease loop), so the no-inbound path is Atom opening an outbound stream to Autumn (WebSocket/SSE) — a new unit | public LB for the prod test |
| 8 | customer app → Atom privately | `internalDns:8080` exists beside the public URL; whether the customer's own app (BYO-VPC) can resolve it is undocumented — question for Alon | ask Alon |
| 9 | `delete_atom` after the customer removed their CloudFormation stack | `cleanup` hangs at `teardown-required`; alien's API accepts `action: "forget"` for that state | open |
| 10 | ~~supervisor spawn failure~~ | children started before a failed spawn kept running unsupervised; a failed replacement left its place empty | startup failure stops the started children and rethrows; a replacement is retried at the restart pace | fixed 2026-09-30 |
| 11 | replicas and rolling deploys | one stateful replica; a release restarts it | replicas + pull, or accept the restart | open |
| 12 | multi-container routing | any container accepts a request and passes it to the slot's owner (Dragonfly-style) | later, with local tracks | parked |
| 13 | old `slot-000.sqlite` layout | files without `-of-N` are ignored on start; only matters for an Atom deployed before slots | none needed unless one exists | none |
| 14 | benchmark shares `/tmp/atom-slot-contention` | two concurrent runs delete each other's files | per-run temp dir | skip |

## Housekeeping

- rename `cachePush` → `atomPush` (herald)
- delete `packages/byoc`, move its helpers next to their callers
- remove `ALIEN_MANAGER_URL` and the local-manager branch of the alien client
- SDK: `serverURL` pointing at Atom, with fallback to the API
- dashboard: show the endpoint URL and the token once
- `plans/customer-cache/units.md` is stale (pre-Atom)
