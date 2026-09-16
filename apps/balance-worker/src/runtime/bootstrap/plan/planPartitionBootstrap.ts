import type {
	PartitionBootstrapPlan,
	PartitionBootstrapState,
	PartitionLogRange,
} from "../types/partitionBootstrap.js";

function assertOffset({ name, value }: { name: string; value: bigint }): void {
	if (value < 0n) throw new RangeError(`${name} cannot be negative`);
}

export function assertPartitionLogRange({
	logStartOffset,
	logEndOffset,
}: PartitionLogRange): void {
	assertOffset({ name: "Kafka log start", value: logStartOffset });
	assertOffset({ name: "Kafka log end", value: logEndOffset });
	if (logStartOffset > logEndOffset) {
		throw new RangeError("Kafka log start cannot exceed its end");
	}
}

export function planPartitionBootstrap({
	localNextOffset,
	checkpoint,
	logRange,
}: PartitionBootstrapState): PartitionBootstrapPlan {
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

	if (
		localNextOffset === null &&
		checkpoint === null &&
		logRange.logStartOffset === 0n
	) {
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
}
