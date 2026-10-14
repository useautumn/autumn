import type { BillingContext, PreviewInvoiceCredits } from "@autumn/shared";
import { billingContextToCurrency } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeCustomerToInvoiceCredits } from "./stripeCustomerToInvoiceCredits";

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
