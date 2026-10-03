import type { PartitionRuntimeContext } from "../types/partitionRuntime.js";

const TIMED_OUT = Symbol("snapshot drain timed out");

/**
 * The partition's snapshot DELETEs and refreshes still on the lane land before it is released, so a successor's cold
 * load finds no row of a customer this worker dropped. Bounded by the recovery drain budget, which already fits inside
 * the rebalance timeout: a stuck store never holds the release, and what it left behind is logged.
 */
export async function drainSnapshotQueues({
	ctx,
}: {
	ctx: PartitionRuntimeContext;
}): Promise<void> {
	const { snapshotQueues } = ctx.stateStore;
	if (!snapshotQueues) return;
	const position = { topic: ctx.config.topic, partition: ctx.config.partition };
	let timer: ReturnType<typeof setTimeout> | undefined;
	function scheduleTimeout(resolve: (outcome: typeof TIMED_OUT) => void): void {
		function expire(): void {
			resolve(TIMED_OUT);
		}
		timer = setTimeout(expire, ctx.config.recoveryDrainTimeoutMs);
	}
	try {
		const outcome = await Promise.race([
			snapshotQueues.drain(position),
			new Promise<typeof TIMED_OUT>(scheduleTimeout),
		]);
		if (outcome !== TIMED_OUT) return;
		const pending = snapshotQueues.pending(position);
		ctx.logger?.warn?.(
			{
				event: "balance_worker.snapshot_drain_timeout",
				data: { ...position, pending },
			},
			`Balance worker released ${position.topic}[${position.partition}] with ${pending} customers' snapshot writes still on the lane`,
		);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
