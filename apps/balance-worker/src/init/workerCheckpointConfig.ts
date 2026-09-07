import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { PartitionCheckpointLimits } from "../checkpoint/partitionCheckpointLimits.js";
import {
	defaultPartitionCheckpointSchedulerConfig,
	type PartitionCheckpointSchedulerConfig,
} from "../checkpoint/scheduling/partitionCheckpointSchedulerConfig.js";
import type { S3CheckpointThreadConfig } from "../s3/background/s3CheckpointThreadConfig.js";

export const workerCheckpointLimits: Readonly<PartitionCheckpointLimits> =
	Object.freeze({
		maxSerializedBytes: 64 * 1024 * 1024,
		maxStates: 100_000,
		maxReceipts: 1_000_000,
	});

export type WorkerCheckpointConfig = {
	scheduler: PartitionCheckpointSchedulerConfig;
} & (
	| { mode: "off" }
	| { mode: "restore_only" | "enabled"; s3: S3CheckpointThreadConfig }
);

export function createWorkerCheckpointConfig({
	env,
}: {
	env: BalanceWorkerEnv;
}): WorkerCheckpointConfig {
	const scheduler = {
		...defaultPartitionCheckpointSchedulerConfig,
		intervalMs: env.BALANCE_WORKER_CHECKPOINT_INTERVAL_MS,
		pollIntervalMs: Math.min(
			defaultPartitionCheckpointSchedulerConfig.pollIntervalMs,
			env.BALANCE_WORKER_CHECKPOINT_INTERVAL_MS,
		),
	};
	const mode = env.BALANCE_WORKER_CHECKPOINT_MODE;
	if (mode === "off") return { mode, scheduler };
	const bucket = env.BALANCE_WORKER_CHECKPOINT_BUCKET;
	const region = env.BALANCE_WORKER_CHECKPOINT_REGION;
	if (!bucket || !region || env.BALANCE_WORKER_SQLITE_PATH === ":memory:")
		throw new Error(
			"S3 checkpoints require bucket, region, and file-backed SQLite",
		);
	return {
		mode,
		scheduler,
		s3: {
			databasePath: env.BALANCE_WORKER_SQLITE_PATH,
			checkpointLimits: workerCheckpointLimits,
			client: {
				region,
				endpoint: env.BALANCE_WORKER_CHECKPOINT_ENDPOINT,
				forcePathStyle: env.BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE,
			},
			storage: {
				bucket,
				keyPrefix: env.BALANCE_WORKER_CHECKPOINT_PREFIX,
				deploymentEnvironment: env.BALANCE_WORKER_DEPLOYMENT,
				limits: {
					maxSerializedBytes: workerCheckpointLimits.maxSerializedBytes,
					maxCompressedBytes: 16 * 1024 * 1024,
					maxPublishAttempts: 3,
				},
			},
		},
	};
}
