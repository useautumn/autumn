import { PartitionCheckpointBodyLimitExceededError } from "../partitionCheckpointEncoding.js";
import { PartitionCheckpointCaptureError } from "../partitionCheckpointExporter.js";
import {
	PartitionCheckpointLimitExceededError,
	type PartitionCheckpointLimitName,
} from "../partitionCheckpointLimits.js";
import { PartitionCheckpointPublisherError } from "../partitionCheckpointPublisher.js";

type ErrorDetails = { name: string; message: string; code?: string };

export type CheckpointThreadFailure =
	| { kind: "capture"; cause: ErrorDetails }
	| {
			kind: "limit";
			limitName: PartitionCheckpointLimitName;
			limit: number;
			observed: number;
	  }
	| {
			kind: "body_limit";
			limitName: "compressed_bytes" | "serialized_bytes";
			limit: number;
			observed: number;
	  }
	| { kind: "publisher"; message: string; retriable: boolean }
	| { kind: "other"; cause: ErrorDetails };

export class PartitionCheckpointThreadError extends Error {
	constructor({ message, cause }: { message: string; cause?: unknown }) {
		super(message, { cause });
		this.name = "PartitionCheckpointThreadError";
	}
}

const errorDetailsOf = (cause: unknown): ErrorDetails => ({
	name: cause instanceof Error ? cause.name : "Error",
	message: cause instanceof Error ? cause.message : String(cause),
	...(cause instanceof Error &&
	"code" in cause &&
	typeof cause.code === "string"
		? { code: cause.code }
		: {}),
});

export const serializeCheckpointThreadFailure = ({
	cause,
}: {
	cause: unknown;
}): CheckpointThreadFailure => {
	if (cause instanceof PartitionCheckpointCaptureError)
		return { kind: "capture", cause: errorDetailsOf(cause.cause) };
	if (cause instanceof PartitionCheckpointLimitExceededError)
		return {
			kind: "limit",
			limitName: cause.limitName,
			limit: cause.limit,
			observed: cause.observed,
		};
	if (cause instanceof PartitionCheckpointBodyLimitExceededError)
		return {
			kind: "body_limit",
			limitName: cause.limitName,
			limit: cause.limit,
			observed: cause.observed,
		};
	if (cause instanceof PartitionCheckpointPublisherError)
		return {
			kind: "publisher",
			message: cause.message,
			retriable: cause.retriable,
		};
	return { kind: "other", cause: errorDetailsOf(cause) };
};

const restoreError = (details: ErrorDetails): Error =>
	Object.assign(new Error(details.message), details);

export const deserializeCheckpointThreadFailure = ({
	failure,
}: {
	failure: CheckpointThreadFailure;
}): Error => {
	switch (failure.kind) {
		case "capture":
			return new PartitionCheckpointCaptureError({
				cause: restoreError(failure.cause),
			});
		case "limit":
			return new PartitionCheckpointLimitExceededError(failure);
		case "body_limit":
			return new PartitionCheckpointBodyLimitExceededError(failure);
		case "publisher":
			return new PartitionCheckpointPublisherError(failure);
		case "other":
			return restoreError(failure.cause);
	}
};
