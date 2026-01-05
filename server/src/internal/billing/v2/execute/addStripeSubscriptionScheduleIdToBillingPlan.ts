import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const addStripeSubscriptionScheduleIdToBillingPlan = ({
	autumnBillingPlan,
	stripeSubscriptionScheduleId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeSubscriptionScheduleId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		customerProduct.scheduled_ids = [stripeSubscriptionScheduleId];
	}
};
