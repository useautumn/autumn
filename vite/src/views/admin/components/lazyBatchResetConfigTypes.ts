export type LazyBatchResetConfig = {
	enabled: boolean;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const LAZY_BATCH_RESET_QUERY_KEY = [
	"admin-edge-config",
	"lazy-batch-reset",
] as const;
