import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** The newest write in the slots this thread owns, by this replica's clock; 0 when they are empty. */
export const maxAppliedAt = ({ ctx }: { ctx: ReplicaSlotsContext }): number =>
	Math.max(
		0,
		...ctx.slots.flatMap(({ sqliteStore }) =>
			sqliteStore ? [sqliteStore.maxAppliedAt()] : [],
		),
	);
