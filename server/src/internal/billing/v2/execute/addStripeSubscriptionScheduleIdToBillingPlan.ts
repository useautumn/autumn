import { CusProductStatus, cp } from "@autumn/shared";
import type {
	AutumnBillingPlan,
	StripeBillingPlan,
} from "@/internal/billing/v2/types";

export const addStripeSubscriptionScheduleIdToBillingPlan = ({
	autumnBillingPlan,
	stripeBillingPlan,
	stripeSubscriptionScheduleId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
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

	const { subscriptionScheduleAction } = stripeBillingPlan;
	if (subscriptionScheduleAction?.type === "update") {
		// Get old schedule ID
		const oldScheduleId =
			subscriptionScheduleAction.stripeSubscriptionScheduleId;
		const newScheduleId = stripeSubscriptionScheduleId;

		if (oldScheduleId && newScheduleId && oldScheduleId !== newScheduleId) {
			autumnBillingPlan.updateByStripeScheduleId = {
				oldScheduleId,
				newScheduleId,
			};
		}
	}
};
