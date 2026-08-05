# Track idempotency (single lane)

Single-lane = `/track` and `/track_tokens`, in all three shapes:

```
sync            claim keys → deduct → 200
sync fallback   claim keys → redis down → enqueue → 202   (claims KEPT)
async: true     claim keys → enqueue → 202                (claims KEPT)
                                │
                                ▼ SQS worker
                        deduct — no client-key claims; replay dedupe only
```

## Client keys — claimed once, at the request path, always

| Key | Where claimed | Scope |
| --- | --- | --- |
| `Idempotency-Key` header | `idempotencyMiddleware` (every API route) | `org:env:idempotency:hash(key)` |
| `body.idempotency_key` | `runTrackWithRollout` / `runAsyncTrack` via `withIdempotencyKey` | same, prefixed `track:` |

Both are independent claims. Duplicate → **409** at accept, on every shape
(async included). Claims are kept for their full TTL — never handed off to the
worker. A retryable failure (non-409 4xx/5xx, unknown error, failed enqueue)
releases the claim so the client can retry.

Storage is `misc/idempotency`, backed by DynamoDB (`autumn-idempotency-keys`,
conditional-put for the atomic claim, TTL attribute for expiry).

## Queue dedupe — server-owned, inside the deduction

SQS is at-least-once, so a queued message can be delivered twice. Replays are
deduped by per-`(request, customer, feature)` keys
(`trackQueueIdempotency.ts`), set **atomically inside the deduction Lua
script** (24h TTL, Redis). A redelivery reuses the original `ctx.id` → same
key → deduction refused, no client involvement.

Because the client keys were already claimed at accept, single-lane messages
are enqueued with `validateTrackBodyIdempotencyKey: false` and the worker
(`runQueuedTrack`) skips the body-key claim. The worker only claims for
messages with no accept-time claim (batch — not yet migrated).

## Files

- `trackBodyIdempotencyKey.ts` — builds the `track:`-prefixed body key
- `trackQueueIdempotency.ts` — the Lua replay-dedupe keys
- `../../misc/idempotency/withIdempotencyKey.ts` — claim → run → release wrapper
