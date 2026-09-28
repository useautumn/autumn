import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { createPartitionCheckpoint } from "../../../src/checkpoint/partitionCheckpoint.js";
import { createS3CheckpointObjectClient } from "../../../src/s3/s3CheckpointObjectClient.js";
import { createS3PartitionCheckpointStorage } from "../../../src/s3/s3PartitionCheckpointStorage.js";

const s3Endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:19000";
const bucket = `balance-checkpoint-${crypto.randomUUID()}`;
const topic = "metering-events-v1";
const partition = 0;
const objectKey = "conditional-write-proof/checkpoint.json.gz";
const client = new S3Client({
	region: "us-east-1",
	endpoint: s3Endpoint,
	forcePathStyle: true,
	credentials: {
		accessKeyId: "autumn-test",
		secretAccessKey: "autumn-test-secret",
	},
	maxAttempts: 1,
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
});

const checkpointAt = (nextOffset: bigint) =>
	createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: 1_700_000_000_000,
		topic,
		partition,
		nextOffset,
		states: [],
		receipts: [],
	});

const statusCodeOf = ({ error }: { error: unknown }): number | null => {
	if (typeof error !== "object" || error === null || !("$metadata" in error)) {
		return null;
	}
	const metadata = error.$metadata;
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		!("httpStatusCode" in metadata)
	) {
		return null;
	}
	return typeof metadata.httpStatusCode === "number"
		? metadata.httpStatusCode
		: null;
};

const expectStatus = async ({
	promise,
	status,
}: {
	promise: Promise<unknown>;
	status: number;
}): Promise<void> => {
	try {
		await promise;
		throw new Error(`Expected S3 status ${status}`);
	} catch (error) {
		expect(statusCodeOf({ error })).toBe(status);
	}
};

const createBucket = async (): Promise<void> => {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 100; attempt += 1) {
		try {
			await client.send(new CreateBucketCommand({ Bucket: bucket }));
			return;
		} catch (error) {
			lastError = error;
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		}
	}
	throw lastError;
};

beforeAll(createBucket);

afterAll(async () => {
	await client
		.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
		.catch(() => undefined);
	await client
		.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: "checkpoints/staging/metering-events-v1/partitions/0/checkpoint.json.gz",
			}),
		)
		.catch(() => undefined);
	await client
		.send(new DeleteBucketCommand({ Bucket: bucket }))
		.catch(() => undefined);
	client.destroy();
});

describe("S3 conditional checkpoint transport", () => {
	test("enforces create and replacement preconditions", async () => {
		const first = await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				Body: "first",
				IfNoneMatch: "*",
			}),
		);
		if (!first.ETag) throw new Error("Expected an ETag from the first PUT");

		await expectStatus({
			promise: client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: objectKey,
					Body: "duplicate",
					IfNoneMatch: "*",
				}),
			),
			status: 412,
		});
		await expectStatus({
			promise: client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: objectKey,
					Body: "wrong-etag",
					IfMatch: '"wrong"',
				}),
			),
			status: 412,
		});
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: objectKey,
				Body: "replacement",
				IfMatch: first.ETag,
			}),
		);
		expect(
			await (
				await client.send(
					new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
				)
			).Body?.transformToString(),
		).toBe("replacement");

		const replacement = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
		);
		await client.send(
			new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
		);
		await expectStatus({
			promise: client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: objectKey,
					Body: "must-not-create",
					IfMatch: replacement.ETag,
				}),
			),
			status: 404,
		});
	});

	test("round-trips a compressed checkpoint through the S3 adapter", async () => {
		const storage = createS3PartitionCheckpointStorage({
			client: createS3CheckpointObjectClient({ client }),
			bucket,
			keyPrefix: "checkpoints",
			deploymentEnvironment: "staging",
			limits: {
				maxCompressedBytes: 1_000_000,
				maxSerializedBytes: 1_000_000,
				maxPublishAttempts: 3,
			},
		});
		const signal = new AbortController().signal;
		const checkpoint = checkpointAt(42n);

		await expect(
			storage.publish({ checkpoint, signal }),
		).resolves.toMatchObject({
			kind: "published",
		});
		await expect(storage.latest({ topic, partition, signal })).resolves.toEqual(
			checkpoint,
		);
		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: "checkpoints/staging/metering-events-v1/partitions/0/checkpoint.json.gz",
			}),
		);
		await expect(
			storage.latest({ topic, partition, signal }),
		).resolves.toBeNull();
	});
});
