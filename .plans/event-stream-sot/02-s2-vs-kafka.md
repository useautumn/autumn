# S2 vs Kafka for this substrate

Research note. Sources: S2 docs (limits, architecture, appends, concurrency, snapshots, pricing, llms.txt), S2 intro blog, YC launch, founder notes on consumer groups. Not a vendor recommendation.

S2 ([s2.dev](https://s2.dev)) is a serverless **stream store**: unlimited durable ordered streams, HTTP API, object-storage backed. Their line is "if Kafka and S3 had a baby." That is marketing. The useful question is whether the *actual* product shape fits a 1M/s usage ledger + per-customer remaining, or whether we just found a prettier log.

## They are the same kind of thing

Both are **append-only durable logs**. Neither is a queue.

| Property | Kafka-class | S2 |
| --- | --- | --- |
| Append only | Yes | Yes. Tail only. |
| Durable before ack | Replica ISR / fsync (typical) | Record acknowledged only after durable in S3 (Standard) or a 3-zone S3 Express quorum (Express) |
| Replay from position | Offset | Sequence number, timestamp, or tail-relative |
| Many independent readers | Yes | Yes. Each reader tracks its own cursor |
| Splice / edit the middle | No | No |
| Compensating events + `event_time` | App-level | App-level |

If the question is "is S2 durable like Kafka?" — yes, in the SoT sense. A 202 that waits for S2's append ack is "on disk in object storage," which is a *stronger* durability story than a Kafka produce that only hit the leader's page cache (depends how you configure Kafka). It is also usually *slower*.

S2 Standard: they publish p99 append **< 500ms**. Express: **< 50ms**. Kafka on local disks is often **5–20ms**. WarpStream-class S3 logs are in the same "object storage ack" latency band as S2 Standard.

So: durability is not why you would pick S2 over Kafka. Latency vs ops vs **cardinality** is.

## Where they actually differ

### 1. Resource model (the real difference)

Kafka's unit of scale is the **partition**. You provision a small number of fat topics (tens to thousands of partitions). A customer is a *key* hashed onto a partition. Many customers share a partition. Creating a million partitions is an operational disaster.

S2's unit of scale is the **stream**. They explicitly allow unlimited streams. A stream has a URL. Dormant streams live as metadata + object segments and take no hot memory. This is the product: per agent session, per user, per customer.

That is not a minor API difference. It changes the architecture:

```text
Kafka:   one topic  ×  N partitions     customer is a key inside a shared pipe
S2:      one stream ×  1 customer       customer is the pipe
```

Per-customer FIFO in Kafka: yes, same key → same partition. You still **multiplex** unrelated customers on that partition. A poison / hot customer / rebalance hits neighbors.

Per-customer FIFO in S2: the stream *is* the customer. Isolation is natural. `check-tail` is "where is this customer." Fencing is "who may write this customer."

S2's own docs and launch post say they thought Kafka users would be the buyers; they found more traction where people were about to abuse Postgres/Redis, and where **stream count** is the problem Kafka will not let you have.

### 2. Writer coordination (S2 is closer to a WAL primitive)

S2 has first-class **conditional appends**:

- `match_seq_num` — optimistic CAS. Append only if the next seq is what you think. 412 otherwise. Documented as a path to exactly-once with retries.
- `fencing_token` — pessimistic exclusive writer. New owner sets a fence command; stale writers 412. Cooperative: appends *without* a token still succeed, so every real writer must send the token.

Kafka does not give you per-key fencing in the protocol. You get partition leadership, transactions, consumer-group assignment. Single-writer-per-customer is an application lock on top.

If the apply engine is "one owner per customer, failover must not dual-write," S2's primitive is closer to MemoryDB's internal log (they cite that paper) than to Kafka produce.

### 3. Consumers

Kafka: consumer groups, committed offsets, rebalance, Connect, Flink sources that speak the protocol.

S2: **no consumer group** (as of their own founder comment and current docs). You know which stream to read. You store the cursor (seq). Flink integration exists and Flink assigns streams as splits. Kubernetes StatefulSet static assignment is the other pattern.

This is fine for "worker W owns customer C, tails `customers/C`." It is awkward for "50 workers chew one org-wide firehose" unless you invent assignment.

Kafka protocol compatibility was **planned** as an OSS layer in the intro blog. It is not the product today. S2 is unconstrained by the Kafka protocol on purpose.

### 4. Throughput shape

S2 documented limits (can be raised):

- **100 MiBps write per stream** (blog earlier said 125; limits page says 100)
- **200 append batches/s per stream per connection** (429 / session throttle)
- Batch: **1000 records or 1 MiB**, atomic
- Reads of recent data: blog said 500 MiBps/stream; historical reads from object storage "without a cap"

1M events/s **aggregate** is not a per-stream problem. If events are ~500B, 1M/s ≈ 500 MiB/s. That is many streams in parallel, which is how S2 wants to be used.

1M events/s on **one** customer is the test. 200 batches/s × 1000 records = 200k records/s **if every batch is full**. A hot customer works only with aggressive batching (same as Kafka). Tiny one-record HTTP appends will die at 200/s per connection.

Kafka routinely does 1M/s on one topic with enough partitions. That is a solved, boring number. S2's published story is "hundreds of MB/s **per stream**" and unlimited streams. Aggregate 1M/s is plausible. It is less proven in public than Kafka.

### 5. Snapshots and trim

S2 documents **snapshot-and-follow** as a first-class pattern: materialize state at cursor `S`, store snapshot externally or in-stream, optionally **trim** the prefix. In-stream snapshot + trim can be one atomic batch with `match_seq_num`.

Kafka has compacted changelog topics and you roll your own snapshot. Same idea, less opinionated.

This matches `snapshot(S) + fold(tail)` exactly.

### 6. Ops, maturity, ecosystem

| | Kafka | S2 |
| --- | --- | --- |
| Age | ~13 years, default protocol | YC, hosted + `s2-lite` single binary |
| Correctness work | Huge production corpus | DST (Turmoil), Antithesis, Porcupine linearizability — serious, still young |
| Tinybird / Connect / Flink | Native, boring | Flink yes; no Kafka Connect universe; Tinybird is another HTTP produce unless we fan-in |
| Compliance | Whatever you run | SOC 2, GDPR DPA, HIPAA BAA listed |
| SLO | You operate it, or vendor | 99.99% availability SLO |
| Price shape | Brokers / MSK / CUs | $0.05/GiB-month retain, $0.05/GiB Standard write, $0.075 Express, cheap per-stream ($0.01 / 1000 stream-months) |

S2's pricing is built for **lots of tiny streams**. Kafka's pricing is built for **few fat clusters**. That again is the cardinality bet.

### 7. Insert / mutate

Same answer as the Kafka doc. S2 cannot splice. Trim deletes a *prefix*, not a hole. Corrections are new records. `event_time` is a field you put in the body (reads can start by timestamp, which is handy for D2 analytics).

## Is this the right use case?

S2's documented sweet spots: agent session WALs, per-user journeys, multiplayer rooms, live views, high-cardinality event sourcing. **Not** "replace our Kafka clickstream + Connect + 12 consumer groups."

Our design wants **both**:

1. **Per-customer wallet log** — serial apply, fencing, snapshot+follow, replay one customer. High stream count. Moderate per-stream rate except whales.
2. **1M/s usage firehose** — analytics, Tinybird, org-wide consumers. Low stream count. High aggregate rate. Consumer groups / fan-in.

S2 is a better *shape* for (1) than Kafka. Kafka is a better *shape* for (2) than S2.

One stream per customer on S2 and "Tinybird tails everything" does **not** work. Tinybird cannot subscribe to a million streams. You would need a fan-in (workers or a second aggregated stream) or keep Tinybird ingest as a separate produce (HTTP, as today).

Putting the **entire** SoT on S2 because the website is interesting is the wrong reason. Putting the **customer ledger** on a high-cardinality log (S2, or a Kafka topic used carefully) is the right reason. Those are different decisions.

## Verdict

**Do not treat S2 as "Kafka but durable."** Kafka is already durable. S2 is "unlimited streams + S3 ack + HTTP + fencing," with no consumer groups and a young ecosystem.

**Do not pick S2 as the only bus** for 1M/s + Tinybird + remaining. Analytics wants a fat firehose. Wallet wants a stream per customer. One product rarely wins both without a fan-in.

**S2 is worth keeping on the shortlist for the wallet log** if we commit to one stream per customer (or per credit-graph). `match_seq_num` / fencing / snapshot-and-follow / trim are the primitives we would otherwise build on Kafka. Unlimited streams is the thing Kafka will not give us cheaply.

**Kafka (or Redpanda / WarpStream) stays the default for ingest + analytics** until S2 has a proven 1M/s aggregate path *and* a boring way to fan-in to Tinybird.

**Risk if we made S2 the SoT tomorrow:** vendor/maturity, Express vs Standard latency for 202, 200 batches/s/connection footgun, no consumer groups, we invent Tinybird fan-in, fencing is cooperative (forgotten token = unfenced writer).

Next layer can stay substrate-agnostic: `usage.intents` and `wallet.facts` keyed by customer. Whether that key is a Kafka partition key or an S2 stream name is a binding, not the architecture.
