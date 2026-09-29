import { type BillingPlan, ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

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

	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message: `Stripe subscription schedules support at most ${STRIPE_SUBSCRIPTION_SCHEDULE_MAX_PHASES} phases, but this request needs ${phaseCount}. Schedule fewer phases.`,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
