import { ErrCode, InternalError } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";

/**
 * Validates Stripe-specific billing context requirements before executing billing plan.
 * These checks ensure the Stripe resources are in a valid state for the operations we need to perform.
 */
export const handleStripeBillingPlanErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	// If there's an existing subscription schedule, validate it has current_phase.start_date
	// This is required for schedule updates (Stripe requires anchoring phases to the current phase start)

	if (billingContext.stripeSubscriptionSchedule) {
		const currentPhaseStart =
			billingContext.stripeSubscriptionSchedule.current_phase?.start_date;

		if (!currentPhaseStart) {
			throw new InternalError({
				message:
					"Cannot update subscription schedule: missing current phase start_date",
				code: ErrCode.InternalError,
			});
		}
	}
};
