import { S3Client } from "@aws-sdk/client-s3";
import type { S3CheckpointThreadConfig } from "./background/s3CheckpointThreadConfig.js";
import { createS3CheckpointObjectClient } from "./s3CheckpointObjectClient.js";
import { createS3PartitionCheckpointStorage } from "./s3PartitionCheckpointStorage.js";

export const createS3CheckpointSourceResource = (
	config: S3CheckpointThreadConfig,
) => {
	const client = new S3Client({
		...config.client,
		maxAttempts: 1,
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
	try {
		return {
			source: createS3PartitionCheckpointStorage({
				...config.storage,
				client: createS3CheckpointObjectClient({ client }),
			}),
			close: () => client.destroy(),
		};
	} catch (cause) {
		client.destroy();
		throw cause;
	}
};
