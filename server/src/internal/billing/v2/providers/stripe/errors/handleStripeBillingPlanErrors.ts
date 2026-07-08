import type { BillingContext, BillingPlan } from "@autumn/shared";
import { ErrCode, InternalError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validatePromotionCodeMinimums } from "@/internal/billing/v2/providers/stripe/errors/validatePromotionCodeMinimums";

/**
 * Validates Stripe-specific billing context requirements before executing billing plan.
 * These checks ensure the Stripe resources are in a valid state for the operations we need to perform.
 */
export const handleStripeBillingPlanErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	const { stripeSubscriptionSchedule } = billingContext;
	const { subscriptionScheduleAction } = billingPlan.stripe;

	validatePromotionCodeMinimums({ ctx, billingContext, billingPlan });

	if (subscriptionScheduleAction?.type !== "update") return;
	if (!stripeSubscriptionSchedule?.subscription) return;

	const currentPhaseStart =
		stripeSubscriptionSchedule.current_phase?.start_date;
	if (!currentPhaseStart) {
		throw new InternalError({
			message:
				"Cannot update subscription schedule: missing current phase start_date",
			code: ErrCode.InternalError,
		});
	}
};
