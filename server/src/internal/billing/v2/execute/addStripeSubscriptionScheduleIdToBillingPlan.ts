import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const addStripeSubscriptionScheduleIdToBillingPlan = ({
	billingPlan,
	stripeSubscriptionScheduleId,
}: {
	billingPlan: BillingPlan;
	stripeSubscriptionScheduleId: string;
}) => {
	for (const customerProduct of billingPlan.autumn.insertCustomerProducts) {
		customerProduct.scheduled_ids = [stripeSubscriptionScheduleId];
	}
};
