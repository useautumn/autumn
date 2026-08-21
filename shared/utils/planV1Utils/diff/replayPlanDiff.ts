import { applyDiff, dedupeItemsByMatchKey } from "./applyDiff.js";
import { type DiffablePlanV1, diffPlanV1 } from "./diffPlanV1.js";

/** Replay the from→to change onto a different plan. */
export const replayPlanDiff = ({
	from,
	to,
	onto,
}: {
	from: DiffablePlanV1;
	to: DiffablePlanV1;
	onto: DiffablePlanV1;
}): DiffablePlanV1 => {
	const applied = applyDiff({ base: onto, diff: diffPlanV1({ from, to }) });
	return {
		...onto,
		...applied,
		items: dedupeItemsByMatchKey(applied.items),
	};
};
