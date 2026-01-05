import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

/**
 * Adds a Stripe subscription ID to a billing plan.
 * @param billingPlan - The billing plan to add the Stripe subscription ID to.
 * @param stripeSubscriptionId - The Stripe subscription ID to add.
 */
export const addStripeSubscriptionIdToBillingPlan = ({
	billingPlan,
	stripeSubscriptionId,
}: {
	billingPlan: BillingPlan;
	stripeSubscriptionId: string;
}) => {
	for (const customerProduct of billingPlan.autumn.insertCustomerProducts) {
		customerProduct.subscription_ids = [stripeSubscriptionId];
	}
};
