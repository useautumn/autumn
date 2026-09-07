import { gunzip, gzip } from "node:zlib";
import {
	InvalidPartitionCheckpointError,
	type PartitionCheckpointV1,
	parsePartitionCheckpoint,
	serializePartitionCheckpoint,
} from "./partitionCheckpoint.js";

export type PartitionCheckpointBodyLimits = {
	maxCompressedBytes: number;
	maxSerializedBytes: number;
};

type PartitionCheckpointBodyLimitName = "compressed_bytes" | "serialized_bytes";

export class PartitionCheckpointBodyLimitExceededError extends Error {
	readonly limitName: PartitionCheckpointBodyLimitName;
	readonly limit: number;
	readonly observed: number;

	constructor({
		limitName,
		limit,
		observed,
	}: {
		limitName: PartitionCheckpointBodyLimitName;
		limit: number;
		observed: number;
	}) {
		super(
			`Partition checkpoint ${limitName} limit ${limit} exceeded by ${observed}`,
		);
		this.name = "PartitionCheckpointBodyLimitExceededError";
		this.limitName = limitName;
		this.limit = limit;
		this.observed = observed;
	}
}

export const assertPartitionCheckpointBodyLimits = ({
	limits,
}: {
	limits: PartitionCheckpointBodyLimits;
}): void => {
	for (const [name, value] of Object.entries(limits)) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
};

const assertWithinLimit = ({
	limitName,
	limit,
	observed,
}: {
	limitName: PartitionCheckpointBodyLimitName;
	limit: number;
	observed: number;
}): void => {
	if (observed <= limit) return;
	throw new PartitionCheckpointBodyLimitExceededError({
		limitName,
		limit,
		observed,
	});
};

const gzipBody = ({ body }: { body: Uint8Array }): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		gzip(body, (error, result) => {
			if (error) reject(error);
			else resolve(result);
		});
	});

const gunzipBody = ({
	body,
	maxOutputLength,
}: {
	body: Uint8Array;
	maxOutputLength: number;
}): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		gunzip(body, { maxOutputLength }, (error, result) => {
			if (error) reject(error);
			else resolve(result);
		});
	});

const isOutputLimitError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	error.code === "ERR_BUFFER_TOO_LARGE";

export const encodePartitionCheckpoint = async ({
	checkpoint,
	limits,
}: {
	checkpoint: PartitionCheckpointV1;
	limits: PartitionCheckpointBodyLimits;
}): Promise<{
	body: Uint8Array;
	compressedBytes: number;
	serializedBytes: number;
}> => {
	assertPartitionCheckpointBodyLimits({ limits });
	const serialized = serializePartitionCheckpoint({ checkpoint });
	const serializedBody = Buffer.from(serialized, "utf8");
	assertWithinLimit({
		limitName: "serialized_bytes",
		limit: limits.maxSerializedBytes,
		observed: serializedBody.byteLength,
	});
	const compressedBody = await gzipBody({ body: serializedBody });
	assertWithinLimit({
		limitName: "compressed_bytes",
		limit: limits.maxCompressedBytes,
		observed: compressedBody.byteLength,
	});
	return {
		body: compressedBody,
		compressedBytes: compressedBody.byteLength,
		serializedBytes: serializedBody.byteLength,
	};
};

export const decodePartitionCheckpoint = async ({
	body,
	limits,
}: {
	body: Uint8Array;
	limits: PartitionCheckpointBodyLimits;
}): Promise<PartitionCheckpointV1> => {
	assertPartitionCheckpointBodyLimits({ limits });
	assertWithinLimit({
		limitName: "compressed_bytes",
		limit: limits.maxCompressedBytes,
		observed: body.byteLength,
	});
	let serializedBody: Buffer;
	try {
		serializedBody = await gunzipBody({
			body,
			maxOutputLength: limits.maxSerializedBytes,
		});
	} catch (cause) {
		if (isOutputLimitError(cause)) {
			throw new PartitionCheckpointBodyLimitExceededError({
				limitName: "serialized_bytes",
				limit: limits.maxSerializedBytes,
				observed: limits.maxSerializedBytes + 1,
			});
		}
		throw new InvalidPartitionCheckpointError({
			message: "Partition checkpoint body is not valid gzip",
			cause,
		});
	}
	assertWithinLimit({
		limitName: "serialized_bytes",
		limit: limits.maxSerializedBytes,
		observed: serializedBody.byteLength,
	});
	return parsePartitionCheckpoint({ input: serializedBody.toString("utf8") });
};
