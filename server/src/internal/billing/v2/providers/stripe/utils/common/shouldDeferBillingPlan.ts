import type { BillingResponseRequiredAction } from "@autumn/shared";
import type Stripe from "stripe";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";

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

	return deferredInvoiceMode || Boolean(requiredAction);
};
