import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	PlanPriceChangeV0,
} from "@autumn/shared";

export const buildPriceChange = ({
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
