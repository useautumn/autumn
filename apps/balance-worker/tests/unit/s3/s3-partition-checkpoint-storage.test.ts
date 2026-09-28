import { describe, expect, test } from "bun:test";
import {
	createPartitionCheckpoint,
	InvalidPartitionCheckpointError,
} from "../../../src/checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointPublisherError } from "../../../src/checkpoint/partitionCheckpointPublisher.js";
import type {
	S3CheckpointObjectClient,
	S3CheckpointPutInput,
} from "../../../src/s3/s3CheckpointObjectClient.js";
import { createS3PartitionCheckpointStorage } from "../../../src/s3/s3PartitionCheckpointStorage.js";

const topic = "metering-events-v1";
const partition = 2;
const limits = {
	maxCompressedBytes: 1_000_000,
	maxSerializedBytes: 1_000_000,
	maxPublishAttempts: 3,
};

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

type StoredObject = {
	body: Uint8Array;
	contentEncoding: string;
	contentLength: number;
	contentType: string;
	etag: string;
	metadata: Record<string, string>;
};

const conditionalError = ({
	status,
}: {
	status: number;
}): Error & {
	$metadata: { httpStatusCode: number };
} =>
	Object.assign(new Error(`S3 ${status}`), {
		$metadata: { httpStatusCode: status },
	});

class InMemoryS3CheckpointObjectClient implements S3CheckpointObjectClient {
	object: StoredObject | null = null;
	headCalls = 0;
	getCalls = 0;
	putCalls = 0;
	putInputs: S3CheckpointPutInput[] = [];
	putError: unknown = null;
	onNextHead: (() => void) | null = null;
	onNextPut: ((input: S3CheckpointPutInput) => Promise<void>) | null = null;
	private etagRevision = 0;

	async head() {
		this.headCalls += 1;
		const hook = this.onNextHead;
		this.onNextHead = null;
		hook?.();
		if (!this.object) return null;
		const { body: _body, ...head } = this.object;
		return head;
	}

	async get() {
		this.getCalls += 1;
		return this.object;
	}

	async put(input: S3CheckpointPutInput) {
		this.putCalls += 1;
		this.putInputs.push(input);
		if (this.putError) throw this.putError;
		const hook = this.onNextPut;
		this.onNextPut = null;
		if (hook) await hook(input);
		if (input.condition.kind === "absent" && this.object) {
			throw conditionalError({ status: 412 });
		}
		if (
			input.condition.kind === "etag" &&
			this.object?.etag !== input.condition.etag
		) {
			throw conditionalError({ status: this.object ? 412 : 404 });
		}
		this.etagRevision += 1;
		const etag = `"etag-${this.etagRevision}"`;
		this.object = {
			body: input.body,
			contentEncoding: input.contentEncoding,
			contentLength: input.body.byteLength,
			contentType: input.contentType,
			etag,
			metadata: { ...input.metadata },
		};
		return { etag };
	}
}

const createStorage = (client: S3CheckpointObjectClient) =>
	createS3PartitionCheckpointStorage({
		client,
		bucket: "balance-checkpoints",
		keyPrefix: "checkpoints",
		deploymentEnvironment: "staging",
		limits,
	});

describe("S3 partition checkpoint storage", () => {
	test("publishes one compressed object and loads it with one GET", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);
		const checkpoint = checkpointAt(42n);

		await expect(
			storage.publish({
				checkpoint,
				signal: new AbortController().signal,
			}),
		).resolves.toEqual({ kind: "published", etag: '"etag-1"' });
		expect(client.object).toMatchObject({
			contentEncoding: "gzip",
			contentType: "application/json",
			metadata: {
				"checkpoint-schema-version": "1",
				"content-hash": checkpoint.contentHash,
				"engine-schema-version": "1",
				"next-offset": "42",
			},
		});
		expect(client.putInputs[0]?.key).toBe(
			"checkpoints/staging/metering-events-v1/partitions/2/checkpoint.json.gz",
		);
		expect(client.headCalls).toBe(1);

		await expect(
			storage.latest({
				topic,
				partition,
				signal: new AbortController().signal,
			}),
		).resolves.toEqual(checkpoint);
		expect(client.getCalls).toBe(1);
		expect(client.headCalls).toBe(1);
	});

	test("returns null for a partition without a checkpoint", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);

		await expect(
			storage.latest({
				topic,
				partition,
				signal: new AbortController().signal,
			}),
		).resolves.toBeNull();
		expect(client.getCalls).toBe(1);
		expect(client.headCalls).toBe(0);
	});

	test("does not replace a checkpoint at an equal or newer offset", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);
		const signal = new AbortController().signal;
		await storage.publish({ checkpoint: checkpointAt(42n), signal });

		await expect(
			storage.publish({ checkpoint: checkpointAt(41n), signal }),
		).resolves.toEqual({ kind: "skipped", remoteNextOffset: 42n });
		expect(client.putCalls).toBe(1);
	});

	test("bounds repeated conditional-write conflicts", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		client.putError = conditionalError({ status: 412 });
		const storage = createStorage(client);

		await expect(
			storage.publish({
				checkpoint: checkpointAt(42n),
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({
			name: PartitionCheckpointPublisherError.name,
			retriable: true,
		});
		expect(client.headCalls).toBe(limits.maxPublishAttempts);
		expect(client.putCalls).toBe(limits.maxPublishAttempts);
	});

	test("does not write after publication is cancelled during the current-object read", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);
		const abortController = new AbortController();
		const revoked = new Error("partition revoked");
		client.onNextHead = () => abortController.abort(revoked);

		await expect(
			storage.publish({
				checkpoint: checkpointAt(42n),
				signal: abortController.signal,
			}),
		).rejects.toBe(revoked);
		expect(client.putCalls).toBe(0);
	});

	test("rechecks after a stale ETag loses the conditional write", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);
		const signal = new AbortController().signal;
		await storage.publish({ checkpoint: checkpointAt(42n), signal });
		client.onNextPut = async () => {
			await storage.publish({ checkpoint: checkpointAt(45n), signal });
		};

		await expect(
			storage.publish({ checkpoint: checkpointAt(44n), signal }),
		).resolves.toEqual({ kind: "skipped", remoteNextOffset: 45n });
		await expect(storage.latest({ topic, partition, signal })).resolves.toEqual(
			checkpointAt(45n),
		);
	});

	test("rejects metadata that disagrees with the checkpoint body", async () => {
		const client = new InMemoryS3CheckpointObjectClient();
		const storage = createStorage(client);
		const signal = new AbortController().signal;
		await storage.publish({ checkpoint: checkpointAt(42n), signal });
		if (!client.object) throw new Error("Expected a stored checkpoint");
		client.object.metadata["next-offset"] = "43";

		await expect(
			storage.latest({ topic, partition, signal }),
		).rejects.toBeInstanceOf(InvalidPartitionCheckpointError);
	});
});
