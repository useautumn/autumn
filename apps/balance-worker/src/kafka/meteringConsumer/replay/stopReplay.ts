import { KafkaPartitionFollowerStoppedError } from "../meteringErrors.js";
import type {
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";

export function stopReplay({
	ctx,
	state,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
}): Promise<void> {
	if (state.stopPromise) return state.stopPromise;
	state.status = "stopped";
	const { topic, partition } = state.position ?? {
		topic: "unassigned",
		partition: 0,
	};
	state.abortController?.abort(
		new KafkaPartitionFollowerStoppedError({ topic, partition }),
	);
	state.stopPromise = settleReplay({ ctx, state });
	return state.stopPromise;
}
async function settleReplay({
	ctx,
	state,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
}): Promise<void> {
	const failures: unknown[] = [];
	let withdrawal: Promise<void> | undefined;
	if (state.position) {
		const { partition } = state.position;
		withdrawal = ctx.consumption.withdrawPartition({ partition });
		try {
			ctx.consumption.pausePartition({ partition });
		} catch (cause) {
			failures.push(cause);
		}
	}
	// Pausing does not settle callbacks already writing to SQLite.
	const [, settled] = await Promise.allSettled([
		state.startPromise,
		withdrawal,
	]);
	if (settled.status === "rejected") failures.push(settled.reason);
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1)
		throw new AggregateError(failures, "Partition replay did not stop safely");
}
export function markReplayUnavailable({
	state,
	cause,
}: {
	state: PartitionReplayState;
	cause: unknown;
}): void {
	if (
		state.status === "created" ||
		state.status === "unavailable" ||
		state.status === "stopped"
	)
		return;
	state.status = "unavailable";
	state.abortController?.abort(cause);
	state.onUnavailable?.({ cause });
}
