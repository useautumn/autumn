import type { PartitionCheckpointV1 } from "../../checkpoint/partitionCheckpoint.js";

export type PartitionLogRange = {
	logStartOffset: bigint;
	logEndOffset: bigint;
};

export type PartitionBootstrapRefusalReason =
	| "checkpoint_ahead_of_log_end"
	| "checkpoint_behind_log_start"
	| "checkpoint_required_for_retention_gap"
	| "local_state_ahead_of_log_end";

export type PartitionBootstrapPlan =
	| { kind: "continue"; nextOffset: bigint }
	| { kind: "initialize"; nextOffset: 0n }
	| { kind: "replace"; checkpoint: PartitionCheckpointV1 }
	| { kind: "restore"; checkpoint: PartitionCheckpointV1 }
	| { kind: "refuse"; reason: PartitionBootstrapRefusalReason };

const assertOffset = ({
	name,
	value,
}: {
	name: string;
	value: bigint;
}): void => {
	if (value < 0n) throw new RangeError(`${name} cannot be negative`);
};

export const assertPartitionLogRange = ({
	logStartOffset,
	logEndOffset,
}: PartitionLogRange): void => {
	assertOffset({ name: "Kafka log start", value: logStartOffset });
	assertOffset({ name: "Kafka log end", value: logEndOffset });
	if (logStartOffset > logEndOffset) {
		throw new RangeError("Kafka log start cannot exceed its end");
	}
};

export const planPartitionBootstrap = ({
	localNextOffset,
	checkpoint,
	logRange,
}: {
	localNextOffset: bigint | null;
	checkpoint: PartitionCheckpointV1 | null;
	logRange: PartitionLogRange;
}): PartitionBootstrapPlan => {
	const checkpointNextOffset = checkpoint?.nextOffset ?? null;
	assertPartitionLogRange(logRange);
	if (localNextOffset !== null) {
		assertOffset({ name: "Local next offset", value: localNextOffset });
	}
	if (checkpointNextOffset !== null) {
		assertOffset({
			name: "Checkpoint next offset",
			value: checkpointNextOffset,
		});
	}

	if (localNextOffset !== null && localNextOffset > logRange.logEndOffset) {
		return { kind: "refuse", reason: "local_state_ahead_of_log_end" };
	}
	if (localNextOffset !== null && localNextOffset >= logRange.logStartOffset) {
		return { kind: "continue", nextOffset: localNextOffset };
	}

	if (
		checkpoint !== null &&
		checkpoint.nextOffset >= logRange.logStartOffset &&
		checkpoint.nextOffset <= logRange.logEndOffset
	) {
		return {
			kind: localNextOffset === null ? "restore" : "replace",
			checkpoint,
		};
	}

	if (localNextOffset === null && logRange.logStartOffset === 0n) {
		return { kind: "initialize", nextOffset: 0n };
	}
	if (
		checkpointNextOffset !== null &&
		checkpointNextOffset < logRange.logStartOffset
	) {
		return { kind: "refuse", reason: "checkpoint_behind_log_start" };
	}
	if (
		checkpointNextOffset !== null &&
		checkpointNextOffset > logRange.logEndOffset
	) {
		return { kind: "refuse", reason: "checkpoint_ahead_of_log_end" };
	}
	return {
		kind: "refuse",
		reason: "checkpoint_required_for_retention_gap",
	};
};
