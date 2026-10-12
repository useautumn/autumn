import type { PartitionPosition, ProgressTracker } from "@autumn/kafka";

export function readPartitionLagMs({
	progress,
	position,
	nowMs,
	joinedAtMs,
	consumedAtJoin,
}: {
	progress: Pick<ProgressTracker, "readProgress" | "readLastRecordTimestamp">;
	position: PartitionPosition;
	nowMs: number;
	joinedAtMs: number | null;
	consumedAtJoin: bigint | null;
}): number | null {
	const { consumedNextOffset, highWatermark } = progress.readProgress(position);
	if (highWatermark === null) return null;
	if (consumedNextOffset !== null && consumedNextOffset >= highWatermark)
		return 0;
	const landedSinceJoin = consumedNextOffset !== consumedAtJoin;
	const behindSinceMs = landedSinceJoin
		? (progress.readLastRecordTimestamp(position) ?? joinedAtMs)
		: joinedAtMs;
	if (behindSinceMs === null) return null;
	return Math.max(0, nowMs - behindSinceMs);
}
