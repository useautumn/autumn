import { z } from "zod/v4";

export const RESET_JOB_V2_CONFIG_LIMITS = {
	scanBatchSize: { min: 1, max: 10_000 },
	workerBatchSize: { min: 1, max: 1_000 },
	maxConcurrentJobs: { min: 1, max: 100 },
	scanIntervalMs: { min: 1_000, max: 60_000 },
	queueHighWaterMessages: { min: 1, max: 10_000 },
	queueDepthPollMs: { min: 1_000, max: 60_000 },
} as const;

export const ResetJobV2ConfigSchema = z.object({
	enabled: z.boolean().default(false),
	scanBatchSize: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.scanBatchSize.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.scanBatchSize.max)
		.default(500),
	workerBatchSize: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.workerBatchSize.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.workerBatchSize.max)
		.default(500),
	maxConcurrentJobs: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.maxConcurrentJobs.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.maxConcurrentJobs.max)
		.default(3),
	scanIntervalMs: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.scanIntervalMs.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.scanIntervalMs.max)
		.default(1_000),
	// Scanner backpressure: pause scanning while the batch reset queue holds
	// more than this many messages (visible + in-flight).
	queueHighWaterMessages: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.queueHighWaterMessages.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.queueHighWaterMessages.max)
		.default(20),
	// How often the scan gates re-check queue depth while waiting.
	queueDepthPollMs: z
		.number()
		.int()
		.min(RESET_JOB_V2_CONFIG_LIMITS.queueDepthPollMs.min)
		.max(RESET_JOB_V2_CONFIG_LIMITS.queueDepthPollMs.max)
		.default(5_000),
});

export type ResetJobV2Config = z.infer<typeof ResetJobV2ConfigSchema>;
