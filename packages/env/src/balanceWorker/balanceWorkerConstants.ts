/** Fixed worker settings: the same in every environment, so none of them is an environment variable. */
// Part of customer placement: changing it needs fresh topics, SQLite and checkpoint namespaces.
// Local dev keeps just enough partitions to exercise routing without 512 Kafka producers.
const LOCAL_PARTITION_COUNT = 4;
export const BALANCE_WORKER_PARTITION_COUNT =
	process.env.NODE_ENV === "development" ? LOCAL_PARTITION_COUNT : 512;

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
export const BALANCE_WORKER_RECEIPT_RETENTION_MS = 86_400_000;
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
 *  those spent joining the group before the first record arrived. Overrunning
 *  leaves the server with no owners at all, so this is deliberately generous:
 *  a slow start costs nothing, and the listener does not wait for it. */
export const BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS = 60_000;

export const BALANCE_WORKER_CATALOG_TTL_MS = 300_000;
export const BALANCE_WORKER_CATALOG_MAX_BYTES = 268_435_456;
