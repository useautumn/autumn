import type { CreateScheduleParamsV0, SetPlansParamsV0 } from "@autumn/shared";

/** create_schedule retains plans it doesn't list, and calls proration billing_behavior. */
export const createScheduleParamsToSetPlansParams = ({
	params,
}: {
	params: CreateScheduleParamsV0 | SetPlansParamsV0;
}): SetPlansParamsV0 => {
	const { billing_behavior: billingBehavior, ...rest } = params;
	const setPlansParams: SetPlansParamsV0 = {
		...rest,
		undeclared_plans:
			"undeclared_plans" in rest && rest.undeclared_plans
				? rest.undeclared_plans
				: "retain",
	};
	if (billingBehavior === undefined) return setPlansParams;

	return { ...setPlansParams, proration_behavior: billingBehavior };
};
