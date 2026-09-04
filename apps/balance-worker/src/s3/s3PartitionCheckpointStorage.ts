import {
	assertPartitionCheckpointBodyLimits,
	type PartitionCheckpointBodyLimits,
} from "../checkpoint/partitionCheckpointEncoding.js";
import type { PartitionCheckpointPublisher } from "../checkpoint/partitionCheckpointPublisher.js";
import type { PartitionCheckpointSource } from "../checkpoint/partitionCheckpointSource.js";
import type { S3CheckpointObjectClient } from "./s3CheckpointObjectClient.js";
import { partitionCheckpointObjectKeyOf } from "./s3PartitionCheckpointObject.js";
import { createS3PartitionCheckpointPublisher } from "./s3PartitionCheckpointPublisher.js";
import { createS3PartitionCheckpointSource } from "./s3PartitionCheckpointSource.js";

export { partitionCheckpointObjectKeyOf };

export type S3PartitionCheckpointStorageLimits =
	PartitionCheckpointBodyLimits & {
		maxPublishAttempts: number;
	};

export const createS3PartitionCheckpointStorage = ({
	client,
	bucket,
	keyPrefix,
	deploymentEnvironment,
	limits,
}: {
	client: S3CheckpointObjectClient;
	bucket: string;
	keyPrefix: string;
	deploymentEnvironment: string;
	limits: S3PartitionCheckpointStorageLimits;
}): PartitionCheckpointPublisher & PartitionCheckpointSource => {
	if (bucket.trim().length === 0) throw new Error("bucket cannot be empty");
	assertPartitionCheckpointBodyLimits({ limits });
	if (
		!Number.isSafeInteger(limits.maxPublishAttempts) ||
		limits.maxPublishAttempts <= 0
	) {
		throw new RangeError("maxPublishAttempts must be a positive safe integer");
	}
	const keyFor = ({ topic, partition }: { topic: string; partition: number }) =>
		partitionCheckpointObjectKeyOf({
			keyPrefix,
			deploymentEnvironment,
			topic,
			partition,
		});

	return {
		...createS3PartitionCheckpointPublisher({
			client,
			bucket,
			keyFor,
			limits,
			maxPublishAttempts: limits.maxPublishAttempts,
		}),
		...createS3PartitionCheckpointSource({
			client,
			bucket,
			keyFor,
			limits,
		}),
	};
};
