import type { CreateScheduleParamsV0, SetPlansParamsV0 } from "@autumn/shared";

/** Renames the legacy billing_behavior param to proration_behavior. */
export const createScheduleParamsToSetPlansParams = ({
	params,
}: {
	params: CreateScheduleParamsV0 | SetPlansParamsV0;
}): SetPlansParamsV0 => {
	const { billing_behavior: billingBehavior, ...rest } = params;
	if (billingBehavior === undefined) return rest;

	return { ...rest, proration_behavior: billingBehavior };
};
