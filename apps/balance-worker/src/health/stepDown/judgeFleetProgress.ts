import type {
	FleetProgress,
	FleetProgressVerdict,
} from "./types/fleetProgress.js";

export function judgeFleetProgress({
	before,
	after,
	ownPartitions,
	minKeptUp,
}: {
	before: FleetProgress;
	after: FleetProgress;
	ownPartitions: ReadonlySet<number>;
	minKeptUp: number;
}): FleetProgressVerdict {
	let active = 0;
	let keptUp = 0;
	for (const [partition, highWatermark] of after.highWatermarks) {
		if (ownPartitions.has(partition)) continue;
		const baselineHigh = before.highWatermarks.get(partition);
		if (baselineHigh === undefined || highWatermark <= baselineHigh) continue;
		active += 1;
		const nextOffset = after.nextOffsets.get(partition);
		if (nextOffset !== undefined && nextOffset > baselineHigh) keptUp += 1;
	}
	return { ok: keptUp >= minKeptUp && keptUp * 2 >= active, active, keptUp };
}
