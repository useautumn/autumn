import type { BillingPlan } from "@autumn/shared";
import { setPlansError } from "./setPlansError";

const STRIPE_SUBSCRIPTION_SCHEDULE_MAX_PHASES = 10;

export const handleStripeSchedulePhaseLimitErrors = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
}) => {
	const scheduleAction = billingPlan.stripe.subscriptionScheduleAction;
	if (scheduleAction?.type !== "create" && scheduleAction?.type !== "update") {
		return;
	}

	const phaseCount = scheduleAction.params.phases?.length ?? 0;
	if (phaseCount <= STRIPE_SUBSCRIPTION_SCHEDULE_MAX_PHASES) return;

	throw setPlansError({
		details: {
			type: "too_many_phases",
			phase_count: phaseCount,
			max_phases: STRIPE_SUBSCRIPTION_SCHEDULE_MAX_PHASES,
		},
	});
};
