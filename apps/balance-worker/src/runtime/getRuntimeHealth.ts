import {
	type OwnedPartitionHealth,
	ownedPartitionHealthOf,
} from "../health/ownedPartitionHealth.js";
import { OwnedPartitionNotReadyError } from "./runtimeErrors.js";
import type {
	PartitionRuntimeScope,
	PartitionRuntimeState,
} from "./types/partitionRuntimeState.js";

export function getRuntimeHealth({
	ctx,
	state,
}: PartitionRuntimeScope): OwnedPartitionHealth {
	const { topic, partition } = ctx.config;
	const health = ownedPartitionHealthOf({
		topic,
		partition,
		status: state.status,
		localNextOffset: ctx.stateStore.readNextOffset({ topic, partition }),
		...ctx.follower.readProgress({ topic, partition }),
		failureReason: state.failureReason,
	});
	return state.checkpointLease
		? { ...health, checkpoint: state.checkpointLease.getHealth() }
		: health;
}

export function assertRuntimeReady({
	state,
}: {
	state: PartitionRuntimeState;
}): void {
	if (state.terminalError) throw state.terminalError;
	if (state.status !== "ready")
		throw new OwnedPartitionNotReadyError({ status: state.status });
}
