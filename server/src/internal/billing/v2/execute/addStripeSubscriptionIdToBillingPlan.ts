import { cp } from "@autumn/shared";
import type { AutumnBillingPlan } from "@autumn/shared";

/**
 * Adds a Stripe subscription ID to a billing plan.
 * @param billingPlan - The billing plan to add the Stripe subscription ID to.
 * @param stripeSubscriptionId - The Stripe subscription ID to add.
 */
export const addStripeSubscriptionIdToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();

		if (!isPaidRecurring) continue;

		customerProduct.subscription_ids = [stripeSubscriptionId];
	}
};
