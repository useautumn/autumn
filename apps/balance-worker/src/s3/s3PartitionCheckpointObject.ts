import {
	InvalidPartitionCheckpointError,
	type PartitionCheckpointV1,
	serializePartitionCheckpoint,
} from "../checkpoint/partitionCheckpoint.js";
import {
	PartitionCheckpointBodyLimitExceededError,
	type PartitionCheckpointBodyLimits,
} from "../checkpoint/partitionCheckpointEncoding.js";
import type { S3CheckpointObjectHead } from "./s3CheckpointObjectClient.js";

export const CHECKPOINT_CONTENT_ENCODING = "gzip";
export const CHECKPOINT_CONTENT_TYPE = "application/json";

const offsetPattern = /^(0|[1-9][0-9]*)$/;
const positiveIntegerPattern = /^[1-9][0-9]*$/;
const contentHashPattern = /^[a-f0-9]{64}$/;
const metadataKeys = {
	checkpointSchemaVersion: "checkpoint-schema-version",
	contentHash: "content-hash",
	engineSchemaVersion: "engine-schema-version",
	nextOffset: "next-offset",
	serializedBytes: "serialized-bytes",
} as const;

export type StoredCheckpointMetadata = {
	contentHash: string;
	nextOffset: bigint;
	serializedBytes: number;
};

export const assertS3CheckpointRequestNotAborted = ({
	signal,
}: {
	signal: AbortSignal;
}): void => {
	if (!signal.aborted) return;
	throw (
		signal.reason ?? new Error("Partition checkpoint storage request aborted")
	);
};

const requireNonEmpty = ({ name, value }: { name: string; value: string }) => {
	if (value.trim().length === 0) throw new Error(`${name} cannot be empty`);
	return value;
};

export const partitionCheckpointObjectKeyOf = ({
	keyPrefix,
	deploymentEnvironment,
	topic,
	partition,
}: {
	keyPrefix: string;
	deploymentEnvironment: string;
	topic: string;
	partition: number;
}): string => {
	if (!Number.isSafeInteger(partition) || partition < 0) {
		throw new RangeError(`Invalid checkpoint partition: ${partition}`);
	}
	const normalizedPrefix = keyPrefix.replace(/^\/+|\/+$/g, "");
	return [
		requireNonEmpty({ name: "keyPrefix", value: normalizedPrefix }),
		encodeURIComponent(
			requireNonEmpty({
				name: "deploymentEnvironment",
				value: deploymentEnvironment,
			}),
		),
		encodeURIComponent(requireNonEmpty({ name: "topic", value: topic })),
		"partitions",
		partition.toString(),
		"checkpoint.json.gz",
	].join("/");
};

const normalizedMetadataOf = ({
	metadata,
}: {
	metadata: Readonly<Record<string, string>>;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(metadata).map(([key, value]) => [key.toLowerCase(), value]),
	);

export const storedCheckpointMetadataOf = ({
	object,
}: {
	object: S3CheckpointObjectHead;
}): StoredCheckpointMetadata => {
	const metadata = normalizedMetadataOf({ metadata: object.metadata });
	const checkpointSchemaVersion =
		metadata[metadataKeys.checkpointSchemaVersion];
	const engineSchemaVersion = metadata[metadataKeys.engineSchemaVersion];
	const contentHash = metadata[metadataKeys.contentHash];
	const nextOffset = metadata[metadataKeys.nextOffset];
	const serializedBytes = metadata[metadataKeys.serializedBytes];
	if (
		checkpointSchemaVersion !== "1" ||
		engineSchemaVersion !== "1" ||
		contentHash === undefined ||
		!contentHashPattern.test(contentHash) ||
		nextOffset === undefined ||
		!offsetPattern.test(nextOffset) ||
		serializedBytes === undefined ||
		!positiveIntegerPattern.test(serializedBytes)
	) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint object metadata is invalid",
		});
	}
	const parsedSerializedBytes = Number(serializedBytes);
	if (!Number.isSafeInteger(parsedSerializedBytes)) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint serialized byte size is invalid",
		});
	}
	return {
		contentHash,
		nextOffset: BigInt(nextOffset),
		serializedBytes: parsedSerializedBytes,
	};
};

export const checkpointObjectMetadataFor = ({
	checkpoint,
	serializedBytes,
}: {
	checkpoint: PartitionCheckpointV1;
	serializedBytes: number;
}): Record<string, string> => ({
	[metadataKeys.checkpointSchemaVersion]: checkpoint.schemaVersion.toString(),
	[metadataKeys.contentHash]: checkpoint.contentHash,
	[metadataKeys.engineSchemaVersion]: checkpoint.engineSchemaVersion.toString(),
	[metadataKeys.nextOffset]: checkpoint.nextOffset.toString(),
	[metadataKeys.serializedBytes]: serializedBytes.toString(),
});

const asBytes = ({ value }: { value: unknown }): Uint8Array => {
	if (value instanceof Uint8Array) return value;
	throw new InvalidPartitionCheckpointError({
		message: "Partition checkpoint object returned a non-byte chunk",
	});
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	typeof value === "object" &&
	value !== null &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

const hasByteArrayTransform = (
	value: unknown,
): value is { transformToByteArray(): Promise<Uint8Array> } =>
	typeof value === "object" &&
	value !== null &&
	"transformToByteArray" in value &&
	typeof value.transformToByteArray === "function";

export const readCheckpointObjectBody = async ({
	body,
	maxBytes,
	signal,
}: {
	body: unknown;
	maxBytes: number;
	signal: AbortSignal;
}): Promise<Uint8Array> => {
	if (body instanceof Uint8Array) {
		if (body.byteLength > maxBytes) {
			throw new PartitionCheckpointBodyLimitExceededError({
				limitName: "compressed_bytes",
				limit: maxBytes,
				observed: body.byteLength,
			});
		}
		return body;
	}
	if (isAsyncIterable(body)) {
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		for await (const value of body) {
			assertS3CheckpointRequestNotAborted({ signal });
			const chunk = asBytes({ value });
			totalBytes += chunk.byteLength;
			if (totalBytes > maxBytes) {
				throw new PartitionCheckpointBodyLimitExceededError({
					limitName: "compressed_bytes",
					limit: maxBytes,
					observed: totalBytes,
				});
			}
			chunks.push(chunk);
		}
		return Buffer.concat(chunks, totalBytes);
	}
	if (hasByteArrayTransform(body)) {
		assertS3CheckpointRequestNotAborted({ signal });
		const transformed = await body.transformToByteArray();
		assertS3CheckpointRequestNotAborted({ signal });
		return readCheckpointObjectBody({ body: transformed, maxBytes, signal });
	}
	throw new InvalidPartitionCheckpointError({
		message: "Partition checkpoint object has no readable body",
	});
};

export const assertCheckpointObjectHeaders = ({
	object,
	limits,
}: {
	object: S3CheckpointObjectHead;
	limits: PartitionCheckpointBodyLimits;
}): void => {
	if (object.contentEncoding?.toLowerCase() !== CHECKPOINT_CONTENT_ENCODING) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint object is not gzip encoded",
		});
	}
	if (object.contentType?.toLowerCase() !== CHECKPOINT_CONTENT_TYPE) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint object has the wrong content type",
		});
	}
	if (
		object.contentLength !== null &&
		(!Number.isSafeInteger(object.contentLength) || object.contentLength < 0)
	) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint object has an invalid content length",
		});
	}
	if (
		object.contentLength !== null &&
		object.contentLength > limits.maxCompressedBytes
	) {
		throw new PartitionCheckpointBodyLimitExceededError({
			limitName: "compressed_bytes",
			limit: limits.maxCompressedBytes,
			observed: object.contentLength,
		});
	}
};

export const assertCheckpointMatchesObject = ({
	checkpoint,
	metadata,
	topic,
	partition,
}: {
	checkpoint: PartitionCheckpointV1;
	metadata: StoredCheckpointMetadata;
	topic: string;
	partition: number;
}): void => {
	const serializedBytes = Buffer.byteLength(
		serializePartitionCheckpoint({ checkpoint }),
		"utf8",
	);
	if (
		checkpoint.topic !== topic ||
		checkpoint.partition !== partition ||
		checkpoint.nextOffset !== metadata.nextOffset ||
		checkpoint.contentHash !== metadata.contentHash ||
		serializedBytes !== metadata.serializedBytes
	) {
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint object metadata disagrees with its body",
		});
	}
};
