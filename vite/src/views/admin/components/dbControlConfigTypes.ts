export type DbControlConfig = {
	balanceCommitter: {
		concurrency: number | null;
		applyLingerMs: number | null;
		maxBatchesPerFlush: number | null;
	};
	configHealthy?: boolean;
	configConfigured?: boolean;
	lastSuccessAt?: string | null;
	error?: string | null;
};

export const DB_CONTROL_DEFAULTS: DbControlConfig = {
	balanceCommitter: {
		concurrency: null,
		applyLingerMs: null,
		maxBatchesPerFlush: null,
	},
};

export const DB_CONTROL_LIMITS = {
	concurrency: { min: 1, max: 64 },
	applyLingerMs: { min: 0, max: 5_000 },
	maxBatchesPerFlush: { min: 1, max: 64 },
} as const;

export const DB_CONTROL_QUERY_KEY = [
	"admin-edge-config",
	"db-control",
] as const;
