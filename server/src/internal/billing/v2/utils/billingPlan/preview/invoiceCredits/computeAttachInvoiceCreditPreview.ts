import type { BillingContext, PreviewInvoiceCredits } from "@autumn/shared";
import { billingContextToCurrency } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeCustomerToInvoiceCredits } from "./stripeCustomerToInvoiceCredits";

/**
 * Build-stage helper that surfaces the Stripe customer's credit balance on
 * the attach preview so sales/dashboard users can see how much credit will
 * offset the next invoice.
 */
export const computeAttachInvoiceCreditPreview = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): PreviewInvoiceCredits | undefined => {
	return stripeCustomerToInvoiceCredits({
		stripeCustomer: billingContext.stripeCustomer,
		currency: billingContextToCurrency({ org: ctx.org, billingContext }),
	});
};
