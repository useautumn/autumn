import { InvalidPartitionCheckpointError } from "../checkpoint/partitionCheckpoint.js";
import {
	decodePartitionCheckpoint,
	PartitionCheckpointBodyLimitExceededError,
	type PartitionCheckpointBodyLimits,
} from "../checkpoint/partitionCheckpointEncoding.js";
import {
	type PartitionCheckpointSource,
	PartitionCheckpointSourceError,
} from "../checkpoint/partitionCheckpointSource.js";
import { isRetriableS3Error } from "./s3CheckpointErrors.js";
import type {
	S3CheckpointObject,
	S3CheckpointObjectClient,
} from "./s3CheckpointObjectClient.js";
import {
	assertCheckpointMatchesObject,
	assertCheckpointObjectHeaders,
	assertS3CheckpointRequestNotAborted,
	readCheckpointObjectBody,
	storedCheckpointMetadataOf,
} from "./s3PartitionCheckpointObject.js";

export const createS3PartitionCheckpointSource = ({
	client,
	bucket,
	keyFor,
	limits,
}: {
	client: S3CheckpointObjectClient;
	bucket: string;
	keyFor({ topic, partition }: { topic: string; partition: number }): string;
	limits: PartitionCheckpointBodyLimits;
}): PartitionCheckpointSource => ({
	latest: async ({ topic, partition, signal }) => {
		const key = keyFor({ topic, partition });
		assertS3CheckpointRequestNotAborted({ signal });
		let object: S3CheckpointObject | null;
		try {
			object = await client.get({ bucket, key, signal });
		} catch (cause) {
			assertS3CheckpointRequestNotAborted({ signal });
			throw new PartitionCheckpointSourceError({
				message: `Unable to load checkpoint ${key}`,
				retriable: isRetriableS3Error({ error: cause }),
				cause,
			});
		}
		assertS3CheckpointRequestNotAborted({ signal });
		if (!object) return null;
		assertCheckpointObjectHeaders({ object, limits });
		const metadata = storedCheckpointMetadataOf({ object });
		if (metadata.serializedBytes > limits.maxSerializedBytes) {
			throw new PartitionCheckpointBodyLimitExceededError({
				limitName: "serialized_bytes",
				limit: limits.maxSerializedBytes,
				observed: metadata.serializedBytes,
			});
		}
		const body = await readCheckpointObjectBody({
			body: object.body,
			maxBytes: limits.maxCompressedBytes,
			signal,
		});
		if (
			object.contentLength !== null &&
			body.byteLength !== object.contentLength
		) {
			throw new InvalidPartitionCheckpointError({
				message: "Partition checkpoint content length disagrees with its body",
			});
		}
		const checkpoint = await decodePartitionCheckpoint({ body, limits });
		assertS3CheckpointRequestNotAborted({ signal });
		assertCheckpointMatchesObject({
			checkpoint,
			metadata,
			topic,
			partition,
		});
		return checkpoint;
	},
});
