import {
	InvalidPartitionCheckpointError,
	PartitionCheckpointContentHashMismatchError,
	UnsupportedPartitionCheckpointSchemaVersionError,
} from "../../checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointSourceError } from "../../checkpoint/partitionCheckpointSource.js";
import { PartitionCheckpointLimitExceededError } from "../../state/checkpoint/restorePartitionCheckpoint.js";
import type { PartitionBootstrapRefusalReason } from "./types/partitionBootstrap.js";

export class PartitionBootstrapRefusedError extends Error {
	readonly retriable = false;
	readonly topic: string;
	readonly partition: number;
	readonly reason: PartitionBootstrapRefusalReason;

	constructor({
		topic,
		partition,
		reason,
	}: {
		topic: string;
		partition: number;
		reason: PartitionBootstrapRefusalReason;
	}) {
		super(`Partition bootstrap refused for ${topic}[${partition}]: ${reason}`);
		this.name = "PartitionBootstrapRefusedError";
		this.topic = topic;
		this.partition = partition;
		this.reason = reason;
	}
}

function isBlockedBootstrapError(cause: unknown): boolean {
	return (
		cause instanceof PartitionBootstrapRefusedError ||
		cause instanceof PartitionCheckpointSourceError ||
		cause instanceof InvalidPartitionCheckpointError ||
		cause instanceof UnsupportedPartitionCheckpointSchemaVersionError ||
		cause instanceof PartitionCheckpointContentHashMismatchError ||
		cause instanceof PartitionCheckpointLimitExceededError
	);
}

export function isPartitionBootstrapBlockedCause({
	cause,
}: {
	cause: unknown;
}): boolean {
	const seen = new Set<unknown>();
	let currentCause = cause;
	while (
		typeof currentCause === "object" &&
		currentCause !== null &&
		!seen.has(currentCause)
	) {
		if (isBlockedBootstrapError(currentCause)) return true;
		seen.add(currentCause);
		if (!("cause" in currentCause)) return false;
		currentCause = currentCause.cause;
	}
	return false;
}
