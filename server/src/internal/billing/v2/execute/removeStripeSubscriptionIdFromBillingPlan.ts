import type { BillingPlan } from "@/internal/billing/v2/billingPlan";

export const removeStripeSubscriptionIdFromBillingPlan = ({
	billingPlan,
	stripeSubscriptionId,
}: {
	billingPlan: BillingPlan;
	stripeSubscriptionId: string;
}) => {
	for (const customerProduct of billingPlan.autumn.insertCustomerProducts) {
		customerProduct.subscription_ids =
			customerProduct.subscription_ids?.filter(
				(id) => id !== stripeSubscriptionId,
			) ?? [];
	}
};
