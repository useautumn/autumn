import { parentPort, workerData } from "node:worker_threads";
import { S3Client } from "@aws-sdk/client-s3";
import { runCheckpointThread } from "../../checkpoint/background/runCheckpointThread.js";
import { capturePartitionCheckpoint } from "../../state/checkpoint/capturePartitionCheckpoint.js";
import { openCheckpointReadDatabase } from "../../state/checkpoint/openCheckpointReadDatabase.js";
import { createS3CheckpointObjectClient } from "../s3CheckpointObjectClient.js";
import { createS3PartitionCheckpointStorage } from "../s3PartitionCheckpointStorage.js";
import type { S3CheckpointThreadConfig } from "./s3CheckpointThreadConfig.js";

if (!parentPort)
	throw new Error("Checkpoint entrypoint requires a worker thread");
const config = workerData as S3CheckpointThreadConfig;
const database = openCheckpointReadDatabase({
	databasePath: config.databasePath,
});
const client = new S3Client({
	...config.client,
	maxAttempts: 1,
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
});
const publisher = createS3PartitionCheckpointStorage({
	...config.storage,
	client: createS3CheckpointObjectClient({ client }),
});

runCheckpointThread({
	port: parentPort,
	limits: config.checkpointLimits,
	stateStore: {
		capturePartitionCheckpoint: (params) =>
			capturePartitionCheckpoint({ database, ...params }),
	},
	publisher,
});

process.on("exit", () => {
	client.destroy();
	database.close();
});
