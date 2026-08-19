import {
	type ApiPlanV1,
	diffPlanV1,
	type PlanChangeCoreV0,
} from "@autumn/shared";
import { buildFreeTrialChange } from "./buildFreeTrialChange.js";
import { buildPlanItemChangesFromDiff } from "./buildPlanItemChanges.js";
import { buildPlanPreviousAttributes } from "./buildPlanPreviousAttributes.js";
import { buildPriceChange } from "./buildPriceChange.js";

/** Core plan diff (price, items, trial, scalars). Undefined when either side
 * is missing or nothing changed. */
export const buildPlanChangeCore = ({
	from,
	to,
}: {
	from?: ApiPlanV1;
	to?: ApiPlanV1;
}): PlanChangeCoreV0 | undefined => {
	if (!from || !to) return undefined;

	const customize = diffPlanV1({ from, to });
	const previous_attributes = buildPlanPreviousAttributes({ from, to });
	const price_change = buildPriceChange({ from, to, customize });
	const free_trial_change = buildFreeTrialChange({ from, to, customize });
	const item_changes = buildPlanItemChangesFromDiff({ from, to });

	if (
		previous_attributes == null &&
		price_change === undefined &&
		free_trial_change === undefined &&
		item_changes.length === 0
	) {
		return undefined;
	}

	return {
		previous_attributes,
		...(price_change !== undefined ? { price_change } : {}),
		...(free_trial_change !== undefined ? { free_trial_change } : {}),
		item_changes,
		...(Object.keys(customize).length > 0 ? { customize } : {}),
	};
};
