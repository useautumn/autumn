import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

/**
 * Computes the updates to apply to the current customer product during an attach transition.
 *
 * - Upgrade (immediate): Expire the current product
 * - Downgrade (end_of_cycle): Mark as canceling at end of cycle
 */
export const computeAttachTransitionUpdates = ({
	attachBillingContext,
}: {
	attachBillingContext: AttachBillingContext;
}): AutumnBillingPlan["updateCustomerProduct"] => {
	const { currentCustomerProduct, planTiming, currentEpochMs, endOfCycleMs } =
		attachBillingContext;

	if (!currentCustomerProduct) return undefined;

	if (planTiming === "immediate") {
		return {
			customerProduct: currentCustomerProduct,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: currentEpochMs,
				canceled: true,
				canceled_at: currentEpochMs,
			},
		};
	}

	// Downgrade: mark as canceling at end of cycle
	return {
		customerProduct: currentCustomerProduct,
		updates: {
			canceled: true,
			canceled_at: currentEpochMs,
			ended_at: endOfCycleMs,
		},
	};
};
