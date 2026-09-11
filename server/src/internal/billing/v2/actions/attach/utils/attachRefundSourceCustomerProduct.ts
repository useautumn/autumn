import type { AttachBillingContext, FullCusProduct } from "@autumn/shared";

/**
 * The plan whose unused time a refund would come from.
 *
 * Only an in-group transition qualifies: computeRefundPlan refunds against
 * billingContext.stripeSubscription, which is the subscription this attach
 * touches — a plan removed cross-group bills on a different one.
 */
export const attachRefundSourceCustomerProduct = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}): FullCusProduct | undefined => billingContext.currentCustomerProduct;
