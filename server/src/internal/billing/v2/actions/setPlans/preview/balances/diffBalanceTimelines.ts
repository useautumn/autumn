import type { SetPlansPreviewBalanceChange } from "@autumn/shared";
import {
	diffScopedBalances,
	type ScopedBalanceDiff,
} from "./diffScopedBalances";
import type { ScopedPhaseBalances } from "./types/scopedPhaseBalances";

const transitionKey = ({
	entity_id,
	feature_id,
	balance,
	previous_attributes,
}: ScopedBalanceDiff) =>
	JSON.stringify([entity_id, feature_id, balance, previous_attributes]);

const timelineTransitions = (timeline: ScopedPhaseBalances[]) =>
	timeline
		.slice(1)
		.map((after, index) =>
			diffScopedBalances({ before: timeline[index], after }),
		);

/**
 * Each phase's balance changes at its start. Timelines hold the balances before the
 * first phase, then at each phase start; a change the saved timeline also makes is `saved`.
 */
export const diffBalanceTimelines = ({
	desired,
	saved,
}: {
	desired: ScopedPhaseBalances[];
	saved?: ScopedPhaseBalances[];
}): SetPlansPreviewBalanceChange[][] => {
	const savedTransitions = saved ? timelineTransitions(saved) : [];

	return timelineTransitions(desired).map((diffs, phaseIndex) => {
		const savedKeys = new Set(
			(savedTransitions[phaseIndex] ?? []).map(transitionKey),
		);
		return diffs.map((diff) => ({
			...diff,
			origin: savedKeys.has(transitionKey(diff)) ? "saved" : "request",
		}));
	});
};
