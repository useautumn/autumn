import {
	InvalidPartitionCheckpointError,
	PartitionCheckpointContentHashMismatchError,
	UnsupportedPartitionCheckpointSchemaVersionError,
} from "../../checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointSourceError } from "../../checkpoint/partitionCheckpointSource.js";
import { PartitionCheckpointLimitExceededError } from "../../state/checkpoint/restorePartitionCheckpoint.js";
import { PartitionBootstrapRefusedError } from "./partitionBootstrap.js";

const isBlockedBootstrapError = (cause: unknown): boolean =>
	cause instanceof PartitionBootstrapRefusedError ||
	cause instanceof PartitionCheckpointSourceError ||
	cause instanceof InvalidPartitionCheckpointError ||
	cause instanceof UnsupportedPartitionCheckpointSchemaVersionError ||
	cause instanceof PartitionCheckpointContentHashMismatchError ||
	cause instanceof PartitionCheckpointLimitExceededError;

export const isPartitionBootstrapBlockedCause = ({
	cause,
}: {
	cause: unknown;
}): boolean => {
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
};
