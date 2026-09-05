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
	const started = state.status !== "created";
	state.status = "stopped";
	const { topic, partition } = state.position;
	const settling = ctx.consumption.withdrawPartition({ partition });
	state.abortController?.abort(
		new KafkaPartitionFollowerStoppedError({ topic, partition }),
	);
	state.stopPromise = settleReplay({ ctx, state, settling, started });
	return state.stopPromise;
}

async function settleReplay({
	ctx,
	state,
	settling,
	started,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	settling: Promise<void>;
	started: boolean;
}): Promise<void> {
	const { partition } = state.position;
	const failures: unknown[] = [];
	try {
		if (started) ctx.consumption.pausePartition({ partition });
	} catch (cause) {
		failures.push(cause);
	}
	// Pausing does not settle callbacks already writing to SQLite.
	const [, withdrawal] = await Promise.allSettled([
		state.startPromise,
		settling,
	]);
	if (withdrawal.status === "rejected") failures.push(withdrawal.reason);
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
