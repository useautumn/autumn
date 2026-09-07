export type PartitionCheckpointScheduleEntry = {
	generation: number;
	nextOffset: bigint;
	lastConfirmedNextOffset: bigint | null;
	dirtySince: number;
	nextAttemptAt: number;
};

export type PartitionCheckpointPlan =
	| { kind: "idle" }
	| { kind: "export"; generation: number };

export const planPartitionCheckpoint = ({
	now,
	entries,
	exportInFlight,
}: {
	now: number;
	entries: readonly PartitionCheckpointScheduleEntry[];
	exportInFlight: boolean;
}): PartitionCheckpointPlan => {
	if (exportInFlight) return { kind: "idle" };
	let selected: PartitionCheckpointScheduleEntry | null = null;
	for (const entry of entries) {
		if (entry.nextAttemptAt > now) continue;
		if (
			entry.lastConfirmedNextOffset !== null &&
			entry.nextOffset <= entry.lastConfirmedNextOffset
		)
			continue;
		if (
			selected === null ||
			entry.dirtySince < selected.dirtySince ||
			(entry.dirtySince === selected.dirtySince &&
				entry.generation < selected.generation)
		)
			selected = entry;
	}
	return selected
		? { kind: "export", generation: selected.generation }
		: { kind: "idle" };
};
