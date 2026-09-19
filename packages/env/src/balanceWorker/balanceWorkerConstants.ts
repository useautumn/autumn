/** Fixed worker settings: the same in every environment, so none of them is an environment variable. */
// Part of customer placement: changing it needs fresh topics, SQLite and checkpoint namespaces.
// Local dev keeps just enough partitions to exercise routing without 512 Kafka producers.
const LOCAL_PARTITION_COUNT = 4;
export const BALANCE_WORKER_PARTITION_COUNT =
	process.env.NODE_ENV === "development" ? LOCAL_PARTITION_COUNT : 512;

export const BALANCE_WORKER_MAX_REQUEST_BYTES = 1_048_576;
export const BALANCE_WORKER_REQUEST_TIMEOUT_MS = 1_000;
export const BALANCE_WORKER_RECEIPT_RETENTION_MS = 86_400_000;
export const BALANCE_WORKER_CHECKPOINT_PREFIX = "balance-checkpoints";
export const BALANCE_WORKER_CHECKPOINT_INTERVAL_MS = 60_000;
export const BALANCE_WORKER_DATABASE_POOL_SIZE = 4;
export const BALANCE_WORKER_CATALOG_TTL_MS = 300_000;
export const BALANCE_WORKER_CATALOG_MAX_BYTES = 268_435_456;
