import {
	encodePartitionCheckpoint,
	PartitionCheckpointBodyLimitExceededError,
	type PartitionCheckpointBodyLimits,
} from "../checkpoint/partitionCheckpointEncoding.js";
import {
	type PartitionCheckpointPublisher,
	PartitionCheckpointPublisherError,
} from "../checkpoint/partitionCheckpointPublisher.js";
import {
	isRetriableS3Error,
	isS3ConditionalConflict,
} from "./s3CheckpointErrors.js";
import type {
	S3CheckpointObjectClient,
	S3CheckpointObjectHead,
} from "./s3CheckpointObjectClient.js";
import {
	assertCheckpointObjectHeaders,
	assertS3CheckpointRequestNotAborted,
	CHECKPOINT_CONTENT_ENCODING,
	CHECKPOINT_CONTENT_TYPE,
	checkpointObjectMetadataFor,
	storedCheckpointMetadataOf,
} from "./s3PartitionCheckpointObject.js";

export const createS3PartitionCheckpointPublisher = ({
	client,
	bucket,
	keyFor,
	limits,
	maxPublishAttempts,
}: {
	client: S3CheckpointObjectClient;
	bucket: string;
	keyFor({ topic, partition }: { topic: string; partition: number }): string;
	limits: PartitionCheckpointBodyLimits;
	maxPublishAttempts: number;
}): PartitionCheckpointPublisher => ({
	publish: async ({ checkpoint, signal }) => {
		const key = keyFor({
			topic: checkpoint.topic,
			partition: checkpoint.partition,
		});
		let encoded:
			| Awaited<ReturnType<typeof encodePartitionCheckpoint>>
			| undefined;
		for (let attempt = 1; attempt <= maxPublishAttempts; attempt += 1) {
			assertS3CheckpointRequestNotAborted({ signal });
			let current: S3CheckpointObjectHead | null;
			try {
				current = await client.head({ bucket, key, signal });
			} catch (cause) {
				assertS3CheckpointRequestNotAborted({ signal });
				throw new PartitionCheckpointPublisherError({
					message: `Unable to read current checkpoint ${key}`,
					retriable: isRetriableS3Error({ error: cause }),
					cause,
				});
			}
			assertS3CheckpointRequestNotAborted({ signal });
			let condition: { kind: "absent" } | { kind: "etag"; etag: string };
			if (current) {
				assertCheckpointObjectHeaders({ object: current, limits });
				const currentMetadata = storedCheckpointMetadataOf({ object: current });
				if (currentMetadata.serializedBytes > limits.maxSerializedBytes) {
					throw new PartitionCheckpointBodyLimitExceededError({
						limitName: "serialized_bytes",
						limit: limits.maxSerializedBytes,
						observed: currentMetadata.serializedBytes,
					});
				}
				if (currentMetadata.nextOffset >= checkpoint.nextOffset) {
					return {
						kind: "skipped",
						remoteNextOffset: currentMetadata.nextOffset,
					};
				}
				if (!current.etag) {
					throw new PartitionCheckpointPublisherError({
						message: `Current checkpoint ${key} has no ETag`,
						retriable: false,
					});
				}
				condition = { kind: "etag", etag: current.etag };
			} else {
				condition = { kind: "absent" };
			}
			encoded ??= await encodePartitionCheckpoint({ checkpoint, limits });
			assertS3CheckpointRequestNotAborted({ signal });
			try {
				return {
					kind: "published",
					...(await client.put({
						bucket,
						key,
						body: encoded.body,
						contentEncoding: CHECKPOINT_CONTENT_ENCODING,
						contentType: CHECKPOINT_CONTENT_TYPE,
						metadata: checkpointObjectMetadataFor({
							checkpoint,
							serializedBytes: encoded.serializedBytes,
						}),
						condition,
						signal,
					})),
				};
			} catch (cause) {
				assertS3CheckpointRequestNotAborted({ signal });
				if (
					isS3ConditionalConflict({ error: cause }) &&
					attempt < maxPublishAttempts
				) {
					continue;
				}
				throw new PartitionCheckpointPublisherError({
					message: `Unable to publish checkpoint ${key}`,
					retriable:
						isS3ConditionalConflict({ error: cause }) ||
						isRetriableS3Error({ error: cause }),
					cause,
				});
			}
		}
		throw new Error("Checkpoint publish loop ended unexpectedly");
	},
});
