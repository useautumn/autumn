import type { AutumnBillingPlan } from "@autumn/shared";

/**
 * Links each customer product in a billing plan to a pending Stripe checkout
 * session. Used by the enable_plan_immediately + stripe_checkout flow so the
 * webhook can find the rows on session.completed / session.expired.
 */
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
