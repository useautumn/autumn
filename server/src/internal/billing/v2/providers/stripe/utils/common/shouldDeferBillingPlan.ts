import type {
	BillingContext,
	BillingResponseRequiredAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";
import { isImmediateInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isImmediateInvoiceMode";

export const shouldDeferBillingPlan = ({
	billingContext,
	latestStripeInvoice,
	requiredAction,
}: {
	billingContext: BillingContext;
	latestStripeInvoice: Stripe.Invoice;
	requiredAction?: BillingResponseRequiredAction;
}): boolean => {
	if (latestStripeInvoice.status === "paid") return false;

	const deferredInvoiceMode = isDeferredInvoiceMode({ billingContext });

	const awaitsInvoiceFinalization =
		isImmediateInvoiceMode({ billingContext }) &&
		latestStripeInvoice.status === "draft";

	return (
		deferredInvoiceMode || awaitsInvoiceFinalization || Boolean(requiredAction)
	);
};
