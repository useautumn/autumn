import type { StripeSubscriptionUpdatedContext } from "./stripeSubscriptionUpdatedContext";

export const isUninvoicedBillingCycleAnchorMove = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: Pick<
		StripeSubscriptionUpdatedContext,
		"previousAttributes" | "eventBillingCycleAnchor" | "stripeSubscription"
	>;
}): boolean => {
	const { previousAttributes, eventBillingCycleAnchor, stripeSubscription } =
		subscriptionUpdatedContext;
	const anchorMoved = previousAttributes?.billing_cycle_anchor !== undefined;
	// A move that raised an invoice is consumed by invoice.created, alongside its balance resets.
	const raisedInvoice = previousAttributes?.latest_invoice !== undefined;
	if (!anchorMoved || raisedInvoice) return false;

	// A late or replayed event must not consume a later anchor's pending reset.
	return eventBillingCycleAnchor === stripeSubscription.billing_cycle_anchor;
};
