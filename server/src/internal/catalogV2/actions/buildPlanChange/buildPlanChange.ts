import {
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type PlanChangeV0,
	type PlanFreeTrialChangeV0,
	type PlanPriceChangeV0,
} from "@autumn/shared";
import { buildPlanItemChangesFromDiff } from "./buildPlanItemChanges.js";
import { buildPlanPreviousAttributes } from "./buildPlanPreviousAttributes.js";

const buildPriceChange = ({
	from,
	to,
	customize,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
	customize: DiffedCustomizePlanV1;
}): PlanPriceChangeV0 | undefined => {
	if (customize.price === undefined) return undefined;

	return {
		previous: from.price,
		current: to.price,
	};
};

const buildFreeTrialChange = ({
	from,
	to,
	customize,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
	customize: DiffedCustomizePlanV1;
}): PlanFreeTrialChangeV0 | undefined => {
	if (customize.free_trial === undefined) return undefined;

	return {
		previous: from.free_trial ?? null,
		current: to.free_trial ?? null,
	};
};

export const buildPlanChange = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): PlanChangeV0 | undefined => {
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
	};
};
