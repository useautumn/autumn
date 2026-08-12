import {
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type PlanBasePriceChangeV0,
	type PlanChangeV0,
	type PlanFreeTrialChangeV0,
} from "@autumn/shared";
import { buildPlanItemChangesFromDiff } from "./buildPlanItemChanges.js";
import { buildPlanPreviousAttributes } from "./buildPlanPreviousAttributes.js";

const buildBasePriceChange = ({
	from,
	to,
	customize,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
	customize: DiffedCustomizePlanV1;
}): PlanBasePriceChangeV0 | undefined => {
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
	const base_price_change = buildBasePriceChange({ from, to, customize });
	const free_trial_change = buildFreeTrialChange({ from, to, customize });
	const item_changes = buildPlanItemChangesFromDiff({ from, to });

	if (
		previous_attributes == null &&
		base_price_change === undefined &&
		free_trial_change === undefined &&
		item_changes.length === 0
	) {
		return undefined;
	}

	return {
		previous_attributes,
		...(base_price_change !== undefined ? { base_price_change } : {}),
		...(free_trial_change !== undefined ? { free_trial_change } : {}),
		item_changes,
	};
};
