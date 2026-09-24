/** Fixed worker settings: the same in every environment, so none of them is an environment variable. */
// Part of customer placement: changing it needs fresh topics, SQLite and checkpoint namespaces.
// Local dev keeps just enough partitions to exercise routing without 512 Kafka producers.
const LOCAL_PARTITION_COUNT = 4;
// A test process talks to the local stack, so it must route over the same partitions.
const isLocalStack =
	process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
export const BALANCE_WORKER_PARTITION_COUNT = isLocalStack
	? LOCAL_PARTITION_COUNT
	: 512;

export const BALANCE_WORKER_MAX_REQUEST_BYTES = 1_048_576;
/** Whole-operation budget for a routed command, not a per-call HTTP timeout: it
 *  spans route resolution, the first send, an ownership refresh and the retry.
 *  Check and track sit in front of customer requests, so this stays inside a
 *  second: a healthy round trip is single-digit milliseconds, and anything that
 *  needs longer is a system in trouble, which the caller should learn about
 *  quickly rather than wait out. The refresh below is what kept the retry from
 *  fitting, so that is bounded separately instead of widening this. */
export const BALANCE_WORKER_REQUEST_TIMEOUT_MS = 1_000;

/** A partition moving is routine, and the refresh lets a request that arrived
 *  mid-move still land instead of failing outright. But it must not spend the
 *  caller's whole budget waiting for ownership to settle: past this slice the
 *  request gives up and answers 503, and the refresh it started carries on in
 *  the background for whoever comes next. */
export const BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS = 200;
/** A flush only waits for the committer's next batch, normally milliseconds. Past this the
 *  caller reads Postgres as it is rather than holding a billing request on a slow worker. */
export const BALANCE_WORKER_FLUSH_TIMEOUT_MS = 300;
export const BALANCE_WORKER_RECEIPT_RETENTION_MS = 86_400_000;
/** How long a partition remembers an applied command id: long enough for a caller's
 *  retry after a 503, not the 24h the idempotency key claim already covers. */
export const BALANCE_WORKER_DEDUP_WINDOW_MS = 600_000;
/** The boot scan's offset lookup is best effort: past this it is skipped, never waited on. */
export const BALANCE_WORKER_REPLAY_FLOOR_LOOKUP_TIMEOUT_MS = 5_000;
export const BALANCE_WORKER_CHECKPOINT_PREFIX = "balance-checkpoints";
export const BALANCE_WORKER_CHECKPOINT_INTERVAL_MS = 60_000;
/** Also the committer's flush concurrency, since a flush holds one connection
 *  for its single statement. At 4 a worker could only drain 4 of its ~85
 *  partitions at a time, so queues hit their pending cap and partitions dropped
 *  into recovery while the database itself sat near 50% CPU.
 *  Budget: 6 workers x 32 = 192 client slots against the primary PgBouncer's
 *  12,000 (see the pool budget guards beside the server's Drizzle setup), so
 *  this stays far inside the fleet allowance. */
export const BALANCE_WORKER_DATABASE_POOL_SIZE = 32;
/** How many partitions a worker may bring up at once. Startup connects and fences
 *  a transactional producer per partition, so an unbounded fan-out means one
 *  init per owned partition all at the same instant. At 512 that saturates the
 *  worker's own Kafka client: connections time out, startup outlives the window
 *  in which the partition stays eligible, and it aborts as "not ready: draining"
 *  and never restarts. Six workers only survived it by splitting the fan-out
 *  about 85 ways, so this sits below that and holds however few workers own the
 *  topic. It costs a slower start, roughly one wave per this many partitions. */
export const BALANCE_WORKER_PARTITION_STARTUP_CONCURRENCY = 16;

/** How long routing may spend reading the ownership log before it gives up and
 *  starts over. The default of ten seconds was written when that log was short.
 *  It accumulates a record per claim and per release, so it grows with every
 *  deploy, and a staging read of it took roughly twenty seconds with four of
 *  those spent joining the group before the first record arrived. Every server
 *  reads the whole log independently, so a large fleet multiplies that
 *  contention: at thirty servers almost none finished inside sixty seconds and
 *  the fleet served "no owner" for everything. Overrunning leaves a server with
 *  no owner table at all, so this is deliberately generous: a slow start costs
 *  nothing, and the listener does not wait for it. The real remedy is letting
 *  the topic compact, which collapses it to about one record per partition. */
export const BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS = 180_000;

export const BALANCE_WORKER_CATALOG_TTL_MS = 300_000;
/** Shared per worker rather than per partition. Staging evicted rows out from
 *  under in-flight decisions at 256 MiB, which surfaces as NOT_READY responses
 *  the caller cannot do anything useful with. */
export const BALANCE_WORKER_CATALOG_MAX_BYTES = 536_870_912;

/** Off: the committer lands every update and increment unconditionally, so a record on the log is a row in Postgres.
 *  A guard only fails when a writer outside the worker changed the row, which is a product bug to fix, not a write to drop. */
export const BALANCE_WORKER_COMMITTER_GUARDS_ENABLED = false;

/** How long a revoked partition keeps serving while it waits for a successor's
 *  `ready`. A successor prepares in under a second; past this the old owner
 *  assumes nobody is coming and releases the way it always did. Must stay well
 *  inside the deploy's stop timeout (90s in prod), since a graceful stop waits
 *  this long per partition wave. */
export const BALANCE_WORKER_HANDOFF_READY_TIMEOUT_MS = 5_000;
/** How long a prepared successor waits to be named owner after announcing
 *  `ready`. The predecessor only has to drain accepted work, normally one
 *  track latency; past this it is dead or stuck and the successor claims for
 *  itself, which fences whatever pen the predecessor still holds. */
export const BALANCE_WORKER_HANDOFF_CLAIM_TIMEOUT_MS = 3_000;
/** How long a request may wait at a successor that has been named owner but is
 *  still fencing and catching up. The activation is a fence plus a bookmark
 *  read; holding the request for it turns a NOT_READY into a 200. */
export const BALANCE_WORKER_ACTIVATION_WAIT_MS = 500;
