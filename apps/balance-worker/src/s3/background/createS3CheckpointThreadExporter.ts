import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { createCheckpointThreadExporter } from "../../checkpoint/background/createCheckpointThreadExporter.js";
import { assertPartitionCheckpointLimits } from "../../checkpoint/partitionCheckpointLimits.js";
import type { S3CheckpointThreadConfig } from "./s3CheckpointThreadConfig.js";

export const createS3CheckpointThreadExporter = (
	config: S3CheckpointThreadConfig,
) => {
	if (!config.databasePath || config.databasePath === ":memory:")
		throw new Error(
			"Background checkpoints require a file-backed SQLite database",
		);
	assertPartitionCheckpointLimits({ limits: config.checkpointLimits });
	const workerData = structuredClone({
		...config,
		databasePath: resolve(config.databasePath),
	});
	return createCheckpointThreadExporter({
		createWorker: () =>
			new Worker(new URL("./s3CheckpointThread.ts", import.meta.url), {
				workerData,
			}),
	});
};
