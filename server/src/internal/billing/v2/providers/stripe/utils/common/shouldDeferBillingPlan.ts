import type {
	BillingContext,
	BillingResponseRequiredAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";
import { isPlanEnabledOnFinalize } from "@/internal/billing/v2/utils/billingContext/isPlanEnabledOnFinalize";

export const shouldDeferBillingPlan = ({
	billingContext,
	latestStripeInvoice,
	requiredAction,
}: {
	billingContext: BillingContext;
	latestStripeInvoice: Stripe.Invoice;
	requiredAction?: BillingResponseRequiredAction;
}): boolean => {
	const deferredInvoiceMode = isDeferredInvoiceMode({
		billingContext,
	});

	if (latestStripeInvoice.status === "paid") return false;

	if (
		latestStripeInvoice.status === "draft" &&
		isPlanEnabledOnFinalize({ billingContext })
	) {
		return true;
	}

	// A past_due subscription is already in dunning: like Stripe, the change applies and its invoice stays open.
	const isInDunning = billingContext.stripeSubscription?.status === "past_due";
	return deferredInvoiceMode || (Boolean(requiredAction) && !isInDunning);
};
