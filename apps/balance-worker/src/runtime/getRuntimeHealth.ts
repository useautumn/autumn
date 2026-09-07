import {
	type OwnedPartitionHealth,
	ownedPartitionHealthOf,
} from "../health/ownedPartitionHealth.js";
import type { PartitionRuntimeScope } from "./types/partitionRuntimeState.js";

export function getRuntimeHealth({
	ctx,
	state,
}: PartitionRuntimeScope): OwnedPartitionHealth {
	const { topic, partition } = ctx.config;
	return ownedPartitionHealthOf({
		topic,
		partition,
		status: state.status,
		localNextOffset: ctx.stateStore.readNextOffset({ topic, partition }),
		...ctx.follower.readProgress({ topic, partition }),
		failureReason: state.failureReason,
	});
}
