# Tinybird delivery: the dedupe decision

Constraint: the `events` datasource stays plain `MergeTree`; Tinybird's Events API is documented
non-idempotent; ingest passes through the Gatherer (re-batched, so ClickHouse identical-block dedupe
is unreachable); the ClickHouse interface is read-only. Under that, exactly-once **rows at rest** is
not achievable — and no vendor achieves it either. What is achievable, and what everyone ships, is
exactly-once **query results**.

## The three-layer consensus (from Lago, OpenMeter, Metronome, Orb, Stripe Meters, Sentry, eBay)

```
1  gate     exactly-once in a transactional store   us: the ledger (serials,
                                                    version guard) + PG projection
2  append   at-least-once into ClickHouse           ordered: duplicate, never lose
3  reads    duplicate-immune                        query-time collapse on the id
```

Money never reads Tinybird: balances = ledger, invoices = Postgres. Tinybird is analytics only.

## The projector's Tinybird lane

1. **Order**: PG transaction (projection rows + outbox mark `tinybird_sent_at`) → Events API with
   `wait=true` → Kafka offset commit.
2. **Reconcile on restart**: for the unmarked batch, query Tinybird for which command ids already
   landed (read-only ClickHouse interface, against the landing table, never an MV); resend only the
   missing. Delay reconciliation past the Gatherer flush window.
3. **Landing table**: `ledger_events`, new datasource, plain MergeTree, `id = command_id`,
   `timestamp = entry.at`. No materialized views on it.
4. **Read-time dedupe in one shared place**: pipes read through a base node doing
   `GROUP BY id` + `ANY JOIN` (Lago's pattern — they replaced `argMax` after OOMs on large
   subscriptions). Never per-caller.
5. **Aggregations**: scheduled Copy Pipes, `COPY_MODE replace` over a bounded window
   ("use replace when you don't control when duplicates occur" — Tinybird's own guidance).

## Rules stolen from other people's incidents

- **Dedupe key = the id alone.** Lago, Stigg, Amberflo, Flexprice fold `timestamp` into the key;
  all four double-bill a retry whose timestamp was server-defaulted.
- **Rows must be deterministic.** OpenMeter mints a fresh ULID per insert attempt, so its duplicates
  can never collapse. Every column of our event row derives from the entry.
- **Dedupe must live in the shared query builder.** Flexprice applies `FINAL` on one read path of
  four; the other three double-count the same data.
- **Insert-time MVs over a deduplicating source are a known-failing pattern** (Tinybird docs, their
  agent skill, and the lambda-architecture guide all state it).
- The only true exactly-once Kafka→ClickHouse design is eBay's Block Aggregator (intent committed
  before the write, byte-identical retry, broker-side block hash) — Tinybird's Gatherer makes it
  impossible here, and it needed a dedicated verifier process even at eBay.

## The one question for Tinybird support

Is `wait=true` read-your-writes against the ClickHouse query interface? If yes, restart
reconciliation closes the window entirely and layer 3 is belt-and-braces. If no, ask for the
Gatherer's worst-case visibility lag and size the reconciliation delay above it.

Full research: three agent reports (ClickHouse mechanisms; Tinybird docs + Sentry/Snuba source;
vendor comparison incl. Lago/OpenMeter/Lotus at source level) — session artifacts, 2026-08-23.
