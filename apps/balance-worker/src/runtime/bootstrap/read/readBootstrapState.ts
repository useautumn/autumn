import {
	assertPartitionCheckpointOwnership,
	type PartitionCheckpointV1,
} from "../../../checkpoint/partitionCheckpoint.js";
import { assertPartitionLogRange } from "../plan/planPartitionBootstrap.js";
import type {
	PartitionBootstrapParams,
	PartitionBootstrapProgress,
	PartitionBootstrapState,
} from "../types/partitionBootstrap.js";

export function readBootstrapProgress({
	ctx,
	topic,
	partition,
	logRange,
	signal,
}: PartitionBootstrapParams): PartitionBootstrapProgress {
	signal.throwIfAborted();
	assertPartitionLogRange(logRange);
	const localNextOffset = ctx.stateStore.readNextOffset({ topic, partition });
	const needsCheckpoint =
		localNextOffset === null || localNextOffset < logRange.logStartOffset;
	return { localNextOffset, needsCheckpoint };
}

export function readBootstrapState({
	ctx,
	topic,
	partition,
	logRange,
	signal,
	progress,
	loadedCheckpoint,
}: PartitionBootstrapParams & {
	progress: PartitionBootstrapProgress;
	loadedCheckpoint: PartitionCheckpointV1 | null;
}): PartitionBootstrapState {
	signal.throwIfAborted();
	const localNextOffset = progress.needsCheckpoint
		? ctx.stateStore.readNextOffset({ topic, partition })
		: progress.localNextOffset;
	const checkpoint =
		localNextOffset === null || localNextOffset < logRange.logStartOffset
			? loadedCheckpoint
			: null;
	if (checkpoint !== null) {
		assertPartitionCheckpointOwnership({
			checkpoint,
			topic,
			partition,
			partitionResolver: ctx.partitionResolver,
		});
	}
	return { localNextOffset, checkpoint, logRange };
}
