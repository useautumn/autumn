import type { AutumnLogger } from "@autumn/logging";
import type { OwnerFence } from "../../state/types/stateStore.js";

const DEFAULT_INTERVAL_MS = 1000;

export type StaleRecordLog = {
	/** Counts a record dropped for carrying a lower epoch than the partition's fence, and logs at most once an interval per partition. */
	record(params: {
		topic: string;
		partition: number;
		offset: bigint;
		ownerEpoch: bigint;
		fence: OwnerFence;
	}): void;
};

/**
 * A stale owner writes in bursts, so the log line carries a count instead of
 * repeating once per record: `count` is how many were dropped since the line
 * before it. Summing `count` over `Stale owner record skipped` is the metric.
 */
export function createStaleRecordLog({
	logger,
	now = Date.now,
	intervalMs = DEFAULT_INTERVAL_MS,
}: {
	logger?: Pick<AutumnLogger, "warn">;
	now?: () => number;
	intervalMs?: number;
}): StaleRecordLog {
	const lastByPartition = new Map<number, { at: number; pending: number }>();
	function record({
		topic,
		partition,
		offset,
		ownerEpoch,
		fence,
	}: Parameters<StaleRecordLog["record"]>[0]): void {
		const at = now();
		const last = lastByPartition.get(partition);
		if (last && at - last.at < intervalMs) {
			last.pending += 1;
			return;
		}
		const count = (last?.pending ?? 0) + 1;
		lastByPartition.set(partition, { at, pending: 0 });
		logger?.warn("Stale owner record skipped", {
			topic,
			partition,
			offset: offset.toString(),
			ownerEpoch: ownerEpoch.toString(),
			fenceEpoch: fence.epoch.toString(),
			fenceOffset: fence.offset.toString(),
			count,
		});
	}
	return { record };
}
