import type { AutumnBillingPlan, StripeBillingPlan } from "@autumn/shared";
import { CusProductStatus, cp } from "@autumn/shared";
import { isFreePhasePlaceholderCustomerProduct } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isFreePhasePlaceholderCustomerProduct";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

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
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();
		const isOnStripeSchedule =
			isPaidRecurring || isFreePhasePlaceholderCustomerProduct(customerProduct);

		if (!isOnStripeSchedule) continue;

		customerProduct.scheduled_ids = [stripeSubscriptionScheduleId];
	}

	for (const { updates } of getUpdateCustomerProducts({ autumnBillingPlan })) {
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
