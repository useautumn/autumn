import type { CreateScheduleParamsV0, SetPlansParamsV0 } from "@autumn/shared";

/** Maps create_schedule's legacy params, or set_plans params stored before the rename, onto set_plans. */
export const createScheduleParamsToSetPlansParams = ({
	params,
}: {
	params: CreateScheduleParamsV0 | SetPlansParamsV0;
}): SetPlansParamsV0 => {
	const { billing_behavior: billingBehavior, ...rest } = params;
	if (billingBehavior === undefined) return rest;

	return { ...rest, proration_behavior: billingBehavior };
};
