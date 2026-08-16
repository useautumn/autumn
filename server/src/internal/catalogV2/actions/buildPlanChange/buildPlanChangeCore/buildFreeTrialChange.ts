import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	PlanFreeTrialChangeV0,
} from "@autumn/shared";

export const buildFreeTrialChange = ({
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
