export type DbControlConfig = {
	balanceCommitter: {
		/** Flushes in flight per balance worker; null keeps the worker's pool size. */
		concurrency: number | null;
	};
	configHealthy?: boolean;
	configConfigured?: boolean;
	lastSuccessAt?: string | null;
	error?: string | null;
};

export const DB_CONTROL_DEFAULTS: DbControlConfig = {
	balanceCommitter: { concurrency: null },
};

export const DB_CONTROL_LIMITS = {
	concurrency: { min: 1, max: 64 },
} as const;

export const DB_CONTROL_QUERY_KEY = [
	"admin-edge-config",
	"db-control",
] as const;
