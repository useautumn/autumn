# packages/tinybird: one structured Tinybird client

2026-09-21 · unit 1 built, uncommitted: package + herald on it, unit tests green · `track-deductions-G` not run yet

## Today: three clients, two row mappers

```
server   initTinybird.ts      @chronark/zod-bird   pipes + events ingest, retries 10x on anything
server   initTinybirdV2.ts    @tinybirdco/sdk      secondary region + migration item events
herald   createTinybird.ts    raw fetch            events ingest, no retries, no timeout
mappers  server mapEvent.ts  ==  herald usageEventToTinybirdRow.ts   (same 17 columns)
```

- The official SDK (`@tinybirdco/sdk@0.0.69`) is already a server dependency.
- `createTinybirdApi({ baseUrl, token, fetch, timeout })` → `ingestBatch(name, rows, { wait, maxRetries, timeout })`.
- The SDK does not gzip. The server wraps `fetch` for that (`gzipTinybirdEventsFetch.ts`).

## What the SDK's retries are, and why that is the right amount

- `maxRetries` retries **only 429** (honours `Retry-After`) **and 503** (200ms → 3s backoff). Off unless set.
- Both mean "nothing was written", so a retry cannot duplicate. The Events API has no idempotency key,
  and 20 `events_*_mv` rollups double-count any duplicate forever (`plans/herald/overview.md`).
- Timeouts, dropped sockets and 500s are ambiguous: the rows may have landed. The SDK does not retry them.
- Herald already answers those: a throw replays the whole Kafka batch (`createStreamConsumer.ts`).
  An in-process retry there is no safer than the replay, so the package adds none.
- zod-bird's blind 10 retries on the server are a live duplicate risk. Out of scope; noted for unit 3.

## Batching: chunk, never buffer

- Herald's batch is the Kafka batch, and the offset commits only after the write. A time or size
  buffer inside the client would ack rows that are not in Tinybird yet. Rejected.
- What the package owns is a **size guard**: the Events API caps a request at 10 MB. Rows are split into
  chunks sent in order; a failed chunk throws, the batch replays.
- Budget: kafkajs only heartbeats after `handle` returns; `sessionTimeoutMs` is 30s. Request timeout
  and retries together must stay well under it (built: one 10s budget covering the request and its 3 retries).

## Shape: mirror `packages/postgres`

```
packages/postgres                      packages/tinybird
  postgres.ts            exports         tinybird.ts
  createPostgresClient   one driver      createTinybirdClient     SDK api + gzip fetch + timeout
  types/postgresClient                   types/tinybirdClient     TinybirdRegion, TinybirdClient
  common/parseRows                       common/ingestRows        chunk → ingestBatch(wait, maxRetries)
                                         common/gzipEventsFetch
  eventsDb/                              eventsTinybird/
    createEventsDb       bound repos       createEventsTinybird   one region               
    repos/usageEvents                      repos/usageEvents      sendUsageEvents: map, ingest, report
    types/eventsDb                         types/eventsTinybird   EventsTinybird, UsageEventRow
                                           usageEventToTinybirdRow
```

- `createEventsTinybird({ ctx: { logger }, config: { region } })` returns
  `{ sendUsageEvents }`: the same contract herald's consumer holds today, so the consumer does not change.
- One region: herald does not dual-write (the secondary was a migration leftover). A failure throws; quarantined rows log loudly.
- A new datasource later is a new folder beside `eventsTinybird/`, reusing `common/ingestRows`.

## Units

| # | unit | ends with this passing |
|---|---|---|
| 1 | **The package, and herald on it.** `packages/tinybird` as above; `getTinybird.ts` builds it; delete `apps/herald/src/external/`. | package unit tests (fake `fetch`): gzip body, 429/503 retried, 500 and timeout throw once, chunking; then `track-deductions-G` |
| 2 | **Migration item events on it.** The server's SDK caller (`insertMigrationItemEvents`) and `gzipTinybirdEventsFetch.ts` move over. | migrations batch suite |
| 3 | **Server events ingest on it.** `sendEvents.ts` + `mapEvent.ts` replaced; zod-bird stays for pipes only. Removes the blind 10x retry. | `track-deductions-G` on the Redis path |

Units 2 and 3 are parked (2026-09-21): the server keeps its clients for now; only herald uses the package.

## Open questions

1. Name: `eventsTinybird` / `EventsTinybird` (mirrors `eventsDb`), or something else?
2. Should unit 1 stop at herald, leaving the server's clients alone for now? (Draft: yes.)
3. Pin `@tinybirdco/sdk` to the server's `^0.0.69`, or move both to a catalog entry?
