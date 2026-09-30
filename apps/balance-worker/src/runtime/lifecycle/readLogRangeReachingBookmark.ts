import {
	BALANCE_WORKER_PREPARATION_LOG_END_POLL_MS,
	BALANCE_WORKER_PREPARATION_LOG_END_WAIT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { sleepWithSignal } from "../bootstrap/read/loadPartitionCheckpoint.js";
import type { PartitionLogRange } from "../bootstrap/types/partitionBootstrap.js";
import type {
	PartitionOutcomeFollowerPort,
	PartitionRuntimeContext,
} from "../types/partitionRuntime.js";

export async function readLogRangeReachingBookmark({
	ctx,
	follower,
	logRange,
	signal,
}: {
	ctx: PartitionRuntimeContext;
	follower: PartitionOutcomeFollowerPort;
	logRange: PartitionLogRange;
	signal: AbortSignal;
}): Promise<PartitionLogRange> {
	const { topic, partition } = ctx.config;
	const waitMs =
		ctx.config.preparationLogEndWaitMs ??
		BALANCE_WORKER_PREPARATION_LOG_END_WAIT_MS;
	const deadline = Date.now() + waitMs;
	let range = logRange;
	while (isBookmarkAhead({ ctx, logRange: range }) && Date.now() < deadline) {
		await sleepWithSignal({
			delayMs: BALANCE_WORKER_PREPARATION_LOG_END_POLL_MS,
			signal,
		});
		range = await follower.readLogRange({ topic, partition, signal });
	}
	return range;
}

function isBookmarkAhead({
	ctx,
	logRange,
}: {
	ctx: PartitionRuntimeContext;
	logRange: PartitionLogRange;
}): boolean {
	const { topic, partition } = ctx.config;
	const bookmark = ctx.stateStore.readNextOffset({ topic, partition });
	return bookmark !== null && bookmark > logRange.logEndOffset;
}
