---
author: john + claude
feature: customer-cache
date: 2026-09-30
status: draft-for-review
---

# Units of work: Atom

Atom (`apps/atom`) is the service in `design/byoc-service.md`. Each unit is one stacked branch and
ends in a test that runs.

| # | unit | what exists after it | test |
|---|---|---|---|
| 1 | **Thin slice, local** | `apps/atom`: Hono on Bun, one process, one SQLite file. `PUT /v1/subjects` stores what herald's cache-push sends (`readSubjectState`'s `{state, catalog}`); `POST /v1/check` reads the row and runs `computeCheck`, replying `{ allowed }`. `bun dw` starts it. One metered feature, customer level | integration: track through the Autumn API, Atom's check flips to refused |
| 2 | **Slots and ordering** | 128 slot files by `hash(customer_id)`; a write lands only over a lower log offset; the shared catalog of non-custom rows | unit: slot routing, stale write refused |
| 3 | **What it cannot answer** | reset due, customer not stored, per-entity balance rows, `send_event` / `lock` / `with_preview` reply "ask the API"; entity checks read the customer's and the entity's rows | unit per case; differential test against the worker's check on generated states |
| 4 | **SDK** | `check` goes to Atom when configured, and to the API on "ask the API", timeout or error | sdk test against a local Atom |
| 5 | **Deploy with alien** | the stack is a Container with a volume and an endpoint; `byoc.create_cache / get_cache / delete_cache` manage it; herald and the SDK authenticate | manual on a sandbox AWS account; ax-eval later |
| 6 | **More than one core** | N processes share the port, each owns a set of slots, a request for another's slot is forwarded; restart is warm | unit for ownership and forwarding; the benchmark at 8 processes |

Replaced by this plan: `packages/byoc` cache entries (`BaseApiCustomerV5` in a KV envelope) and
the `kv` resource in `packages/alien/stacks/byoc/alien.json`. Nothing is in production.

## Decided: Atom speaks Autumn's check interface (John, 2026-09-30)

- The SDK only changes its base URL. Atom serves `POST /v1/balances.check` with Autumn's own
  request and response, per API version, through the same version changes the server applies.
- The response is rendered by the code the server's worker path uses today
  (`checkAnswerToApiResponse`, `workerStateToApiBalance`), moved to `shared` so both call it.
- What Atom cannot answer it forwards to the Autumn API with the caller's key: a customer it does
  not hold, `send_event`, `lock`, `with_preview`, `product_id` checks, and every other route.
  There is no "ask the API" reply and no fallback logic in the SDK.
- This replaces unit 1's `{ allowed }` reply and unit 4 (SDK). It lands as its own unit once the
  thin slice runs end to end.

## Decided: where the catalog lives (John, 2026-09-30)

- Every customer push still carries the catalog rows that customer references.
- Atom also keeps a shared catalog, holding only non-custom rows.
- On a check Atom reads both: a shared row wins when one matches, else the customer's copy is used
  (custom rows only ever exist on the customer).

## Open

1. What writes the shared catalog: only a push on a plan or feature edit, or customer pushes too
   (insert when absent). Unit 2.
