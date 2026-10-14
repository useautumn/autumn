import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

/** The update leaves (or sets) cancel_at, so Stripe ends the new period there. */
const updateKeepsCancelAt = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction: Extract<
		StripeSubscriptionAction,
		{ type: "update" }
	>;
}) => {
	const cancelAt = stripeSubscriptionAction.params.cancel_at;
	if (cancelAt === undefined)
		return Boolean(billingContext.stripeSubscription?.cancel_at);
	return typeof cancelAt === "number";
};

export const willStripeSubscriptionUpdateCreateInvoice = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	if (stripeSubscriptionAction?.type !== "update") return false;

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (!isTrialing || willBeTrialing) return false;

	// Ending a trial into a cancel date is a proration Stripe leaves uninvoiced, so Autumn invoices it.
	return !updateKeepsCancelAt({ billingContext, stripeSubscriptionAction });
};
