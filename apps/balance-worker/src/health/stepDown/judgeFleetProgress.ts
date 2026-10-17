import type {
	FleetProgress,
	FleetProgressVerdict,
} from "./types/fleetProgress.js";

export function judgeFleetProgress({
	before,
	after,
	ownPartitions,
	minKeptUp,
	elapsedMs,
	maxLagMs,
}: {
	before: FleetProgress;
	after: FleetProgress;
	ownPartitions: ReadonlySet<number>;
	minKeptUp: number;
	elapsedMs: number;
	maxLagMs: number;
}): FleetProgressVerdict {
	let active = 0;
	let keptUp = 0;
	for (const [partition, highWatermark] of after.highWatermarks) {
		if (ownPartitions.has(partition)) continue;
		const baselineHigh = before.highWatermarks.get(partition);
		if (baselineHigh === undefined || highWatermark <= baselineHigh) continue;
		active += 1;
		const owner = {
			baselineNext: before.nextOffsets.get(partition),
			next: after.nextOffsets.get(partition),
		};
		if (owner.baselineNext === undefined || owner.next === undefined) continue;
		if (owner.next <= owner.baselineNext || owner.next <= baselineHigh)
			continue;
		const arrived = highWatermark - baselineHigh;
		const lag = highWatermark - owner.next;
		if (lag * BigInt(elapsedMs) <= arrived * BigInt(maxLagMs)) keptUp += 1;
	}
	return { ok: keptUp >= minKeptUp && keptUp * 2 >= active, active, keptUp };
}
