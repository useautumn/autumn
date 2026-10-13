import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

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

	// A flexible-mode sub ending its trial into a cancel_at cuts the period there and invoices nothing.
	return !updateKeepsCancelAt({ billingContext, stripeSubscriptionAction });
};
