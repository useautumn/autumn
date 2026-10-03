/** Per partition: one SELECT of up to this many subjects in flight at a time. */
export const SNAPSHOT_BATCH_SIZE = 200;
/** Misses go to the full query this many at a time per partition, so a cold herd cannot take the pool. */
export const SNAPSHOT_FALLBACKS_IN_FLIGHT = 2;
/** Subjects waiting per partition; past it a load is refused at once, NOT_READY, with no statement. */
export const SNAPSHOT_QUEUE_CAP = 1_000;
/** A subject whose full query failed this many times running is quarantined for the window: answered NOT_READY, no statement. */
export const SNAPSHOT_QUARANTINE_AFTER = 3;
export const SNAPSHOT_QUARANTINE_MS = 60_000;
/** Quarantine entries kept, oldest out first. */
export const SNAPSHOT_QUARANTINE_CAP = 10_000;
/** Backoff between retries of a SELECT Postgres refused transiently; the committer's retry values. */
export const SNAPSHOT_BACKOFF_MS = { initial: 50, max: 800 };
