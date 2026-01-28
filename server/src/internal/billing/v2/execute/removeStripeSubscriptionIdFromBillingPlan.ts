import type { AutumnBillingPlan } from "@/internal/billing/v2/types";

export const removeStripeSubscriptionIdFromBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		customerProduct.subscription_ids =
			customerProduct.subscription_ids?.filter(
				(id) => id !== stripeSubscriptionId,
			) ?? [];
	}
};
