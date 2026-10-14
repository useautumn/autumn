import type { AutumnBillingPlan } from "@autumn/shared";

export const addStripeCheckoutSessionIdToBillingPlan = ({
	autumnBillingPlan,
	stripeCheckoutSessionId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeCheckoutSessionId: string;
}) => {
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		customerProduct.stripe_checkout_session_id = stripeCheckoutSessionId;
	}
};
