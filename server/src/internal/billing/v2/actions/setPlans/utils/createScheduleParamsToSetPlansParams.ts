import type { CreateScheduleParamsV0, SetPlansParamsV0 } from "@autumn/shared";

const toFirstPhaseBillingCycleAnchor = (
	anchor: CreateScheduleParamsV0["billing_cycle_anchor"],
) => (anchor === "now" ? "phase_start" : anchor);

/** create_schedule retains plans it doesn't list, and sets the first phase's billing on the request. */
export const createScheduleParamsToSetPlansParams = ({
	params,
}: {
	params: CreateScheduleParamsV0 | SetPlansParamsV0;
}): SetPlansParamsV0 => {
	const undeclaredPlans =
		"undeclared_plans" in params && params.undeclared_plans
			? params.undeclared_plans
			: "retain";
	if (!("billing_behavior" in params) && !("billing_cycle_anchor" in params)) {
		return { ...params, undeclared_plans: undeclaredPlans };
	}

	const {
		billing_behavior: prorationBehavior,
		billing_cycle_anchor: billingCycleAnchor,
		phases: [firstPhase, ...laterPhases],
		...rest
	} = params as CreateScheduleParamsV0;
	return {
		...rest,
		undeclared_plans: undeclaredPlans,
		phases: [
			{
				...firstPhase,
				proration_behavior: prorationBehavior ?? firstPhase.proration_behavior,
				billing_cycle_anchor:
					toFirstPhaseBillingCycleAnchor(billingCycleAnchor) ??
					firstPhase.billing_cycle_anchor,
			},
			...laterPhases,
		],
	};
};
