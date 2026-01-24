import { CusProductStatus, cp } from "@autumn/shared";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const addStripeSubscriptionScheduleIdToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionScheduleId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionScheduleId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		const { valid } = cp(customerProduct).paid().recurring();

		if (!valid) continue;

		customerProduct.scheduled_ids = [stripeSubscriptionScheduleId];
	}

	// Add to update customer product
	if (autumnBillingPlan.updateCustomerProduct) {
		const { updates } = autumnBillingPlan.updateCustomerProduct;
		const isExpiring = updates.status === CusProductStatus.Expired;

		if (!isExpiring) {
			updates.scheduled_ids = [stripeSubscriptionScheduleId];
		}
	}
};
