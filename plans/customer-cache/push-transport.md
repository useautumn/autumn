---
author: john + capy
feature: customer-cache
date: 2026-10-01
status: decided, not built
---

# Atom: Autumn → Atom pushes without inbound traffic

Resolves open decisions #7 (public LB) and #8 (`internalDns`) in `open-decisions.md`.

## Decision

Prod Atoms accept no inbound connections from the internet. The customer's app reaches Atom over
the VPC-internal `internalDns:8080` (Alon guarantees this resolves from the customer's own
workloads). Autumn's pushes go through an `alien.Queue` (SQS in the customer's account): herald
sends through alien's API, Atom long-polls the queue with `@alienplatform/bindings`.
`publicEndpoints` is removed from the stack.

```
┌────────┐ POST /v1/commands ┌───────┐    ┌──────────────┐
│ herald │──────────────────▶│ alien │───▶│ SQS          │
└────────┘  (one per batch)  └───────┘    │ (customer    │
                                          │  account)    │
                                          └──────┬───────┘
                                   queue.receive(10)
                                   WaitTime 20 s, ack()
                                          ┌──────┴───────┐
                                          │ Atom         │
                                          │ N processes  │
                                          └──────▲───────┘
                       customer app ─────────────┘
                       internalDns:8080 (private)
```

## Why this over the others

| option | verdict |
|---|---|
| public LB + `x-atom-token` (today) | customer must open a firewall rule; many teams won't |
| alien Commands pull receiver | HTTPS lease loop, 5 s poll, 1 lease at a time: an RPC bus, not a push path |
| alien.Queue (SQS) | **chosen**: in the customer's cloud, ms latency, Atom reads directly with the instance role; alien is only on the send side |
| per-org S2 stream, Atom tails it | offsets + replay, but a second egress domain and an S2 token at the customer |
| Atom long-polls Autumn (S2/Redis behind) | one egress domain, but we build and run the log |
| WebSocket to Autumn | a pod owns the socket, herald must find it: a broker to save ~30 ms |
| Postgres "latest row per subject" | no: pushes happen at the track rate |

Ordering is not needed: a push is a `set`, and Atom already dedupes by `read_at` with the
`log_offset` tiebreak. A standard (non-FIFO) queue is fine.

## What the SDKs actually do (verified 2026-10-01, v3.3.26)

`@alienplatform/commands` (send side, pure `fetch`):
- `CommandsClient.forDeployment({ deploymentId, apiKey })` resolves the manager and mints a
  short-lived token; reuse the client.
- `invoke(cmd, input)` = `POST /v1/commands` then polls `GET /v1/commands/{id}` every 500 ms →
  5 s until a terminal state. **No batch/`invokeMany`.** No fire-and-forget option in the client,
  but `POST /v1/commands` alone is a plain fetch: call it directly and skip the poll.
- Body: `{ deploymentId, command, params, deadline?, idempotencyKey?, targetResourceId }`.
  Oversized params are auto-promoted to blob storage, so batch size is not bounded by the API.

`@alienplatform/bindings` (receive side, native addon, Node/Bun, linux-arm64 supported):
- `queue("name").receive(max)` with `max` 1..10 → one SQS `ReceiveMessage`,
  `WaitTimeSeconds` hard-coded to 20 (long poll). Then `ack(receiptHandle)` / `nack`.
- `attempt` is always 1 on SQS today (receive count not requested).
- Source-built apps embed the addon as CJS: **no top-level `await`** in Atom's entry.
- Needs `.link(queue)` on the container in the stack; credentials come from the instance role.

Open question for Alon: is one `POST /v1/commands` per batch fine at our rate, and is a direct
queue send from Autumn's cloud (cross-account role in the CF stack) on the roadmap?

## Design

**Batching is ours.** One command carries N subject bodies (the existing `AtomSubjectBody`), so
the receive rate is `10 × N` per round trip. Herald already handles records in batches
(`cachePushConsumer` → `recordsToCacheSubjects`), so the batch boundary exists.

**Atom receive loop.** Atom runs `ATOM_PROCESSES` processes sharing one port, each writing all
128 slot files under WAL + `BEGIN IMMEDIATE`. Each process runs k `receive(10)` loops; each
message fans its N subjects into the existing local `setSubject` path, then acks. Parallel
receivers only contend on the same slot. Rough ceiling on a t4g.micro: ~250–500 msg/s per loop,
2 processes × 4 loops ≈ 2–4k msg/s before SQLite is the limit.

**Catalog pushes** go the same way (`catalog.set` as a command type).

**Staleness guard** (new, needed for any pull design): if Atom's last applied `read_at` is older
than a threshold, forward checks to the API instead of answering stale. Today's design has none.

**Release window.** SQS retains 14 days, so pushes during a restart queue up instead of being
lost (closes open decision #3 for the restart case; a failed apply still needs the retry story).

## Units

1. **Stack + receive loop.** `alien.json`: add a queue resource, link it to `atom`, keep
   `publicEndpoints` for now. Atom: a `receive` module per process that polls, applies via
   `setSubject` / `setCatalog`, acks. Integration test: send through the queue binding locally
   (alien dev manager) and assert the check answer.
2. **Herald send.** `createAtomClient` gets a second transport: `POST /v1/commands` with a batch
   body, retry on 5xx/429 with the existing `retryWithBackoff`. Keep the HTTP transport behind
   the same `AtomClient` interface until prod has moved.
3. **Staleness guard** in `answerCheck`.
4. **Drop `publicEndpoints`**, `byoc.get_atom` returns `internalDns` as `endpoint_url`, dashboard
   copy changes.
5. Cleanup: remove `x-atom-token` HTTP push path, `atomTokenMiddleware` stays only for checks.

## Code pointers

- herald send: `apps/herald/src/atom/createAtomClient.ts`, `types/atomClient.ts`,
  `consumers/cachePush/cachePushConsumer.ts`
- Atom processes: `apps/atom/src/init/createAtomSupervisor.ts`, `main.ts` (`ATOM_PROCESSES`)
- Atom apply path: `apps/atom/src/processor/actions/setSubject/setSubject.ts`,
  `http/handlers/receiveSetSubject.ts`, `receiveSetCatalog.ts`
- stack: `packages/alien/stacks/byoc/alien.json`
- server deployer: `server/src/internal/byoc/deployers/createAlienAtomDeployer.ts`
- SDK tarballs unpacked for reading: `~/.capy/work/alien-sdk/`
