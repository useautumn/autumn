/** One object per config under the admin prefix; the timestamp signals every poller that something changed. */
export const EDGE_CONFIG_TIMESTAMP_KEY = "admin/edge-config-timestamp.json";
export const DB_CONTROL_CONFIG_KEY = "admin/db-control-config.json";
/** Predates the misc rename; renaming the object is config-breaking, so it stays. */
export const MISC_REDIS_CONFIG_KEY = "admin/main-redis-cache-config.json";
export const SHADOW_ATOM_CONFIG_KEY = "admin/shadow-atom-config.json";
export const BALANCE_WORKER_THREADS_CONFIG_KEY =
	"admin/balance-worker-threads-config.json";
/** What the balance worker does with `subject_snapshots`; read at every decision that touches the table. */
export const BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY =
	"admin/balance-worker-subject-snapshots.json";
