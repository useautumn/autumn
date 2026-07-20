import type { AutumnBillingPlan } from "@autumn/shared";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

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
	for (const update of getUpdateCustomerProducts({ autumnBillingPlan })) {
		const subscriptionIds =
			update.updates.subscription_ids ??
			update.customerProduct.subscription_ids ??
			[];
		update.updates.subscription_ids = subscriptionIds.filter(
			(id) => id !== stripeSubscriptionId,
		);
	}
};
