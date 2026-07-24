type NumericLimit = {
	min: number;
	max: number;
};

export type ResetJobV2Config = {
	enabled: boolean;
	scanBatchSize: number;
	workerBatchSize: number;
	maxConcurrentJobs: number;
	scanIntervalMs: number;
	queueHighWaterMessages: number;
	queueDepthPollMs: number;
	limits: {
		scanBatchSize: NumericLimit;
		workerBatchSize: NumericLimit;
		maxConcurrentJobs: NumericLimit;
		scanIntervalMs: NumericLimit;
		queueHighWaterMessages: NumericLimit;
		queueDepthPollMs: NumericLimit;
	};
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export type ResetJobV2FormValues = Pick<
	ResetJobV2Config,
	| "enabled"
	| "scanBatchSize"
	| "workerBatchSize"
	| "maxConcurrentJobs"
	| "scanIntervalMs"
	| "queueHighWaterMessages"
	| "queueDepthPollMs"
>;

export const RESET_JOB_V2_QUERY_KEY = [
	"admin-edge-config",
	"reset-job-v2",
] as const;
