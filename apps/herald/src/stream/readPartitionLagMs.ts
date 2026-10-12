import type { PartitionPosition, ProgressTracker } from "@autumn/kafka";

export function readPartitionLagMs({
	progress,
	position,
	nowMs,
	joinedAtMs,
}: {
	progress: Pick<ProgressTracker, "readProgress" | "readLastRecordTimestamp">;
	position: PartitionPosition;
	nowMs: number;
	joinedAtMs: number | null;
}): number | null {
	const { consumedNextOffset, highWatermark } = progress.readProgress(position);
	if (highWatermark === null) return null;
	if (consumedNextOffset !== null && consumedNextOffset >= highWatermark)
		return 0;
	const behindSinceMs =
		progress.readLastRecordTimestamp(position) ?? joinedAtMs;
	if (behindSinceMs === null) return null;
	return Math.max(0, nowMs - behindSinceMs);
}
