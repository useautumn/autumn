import type { PartitionLoadSource } from "@autumn/kafka";

const DEFAULT_HALF_LIFE_MS = 5 * 60_000;

/**
 * The recent cost of every partition this process has served: bytes committed
 * to the log, decaying with a five-minute half-life so a customer's burst last
 * hour does not decide where it sits now. The consumer group's assigner sends
 * it with each rejoin, and the leader deals hot partitions apart instead of by
 * number. Bytes stand in for thread time because a track's cost here is
 * building and encoding the customer's state, which is what the bytes are.
 */
export type PartitionLoad = PartitionLoadSource & {
	record(entry: { partition: number; bytes: number }): void;
	forget(entry: { partition: number }): void;
};

export function createPartitionLoad({
	now,
	halfLifeMs = DEFAULT_HALF_LIFE_MS,
}: {
	now(): number;
	halfLifeMs?: number;
}): PartitionLoad {
	if (!(halfLifeMs > 0)) throw new RangeError("halfLifeMs must be positive");
	const loads = new Map<number, { weight: number; at: number }>();

	function decayed(entry: { weight: number; at: number }, at: number): number {
		return entry.weight * 2 ** (-Math.max(0, at - entry.at) / halfLifeMs);
	}

	function record({
		partition,
		bytes,
	}: {
		partition: number;
		bytes: number;
	}): void {
		if (!(bytes >= 0)) throw new RangeError("bytes must be non-negative");
		const at = now();
		const current = loads.get(partition);
		loads.set(partition, {
			weight: (current ? decayed(current, at) : 0) + bytes,
			at,
		});
	}

	function forget({ partition }: { partition: number }): void {
		loads.delete(partition);
	}

	function snapshot(): ReadonlyMap<number, number> {
		const at = now();
		const weights = new Map<number, number>();
		for (const [partition, entry] of loads) {
			weights.set(partition, decayed(entry, at));
		}
		return weights;
	}

	return { record, forget, snapshot };
}
