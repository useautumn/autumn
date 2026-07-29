import type { BillingContext, PreviewInvoiceCredits } from "@autumn/shared";
import { billingContextToCurrency, stripeToAtmnAmount } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

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
	if (!billingContext.stripeCustomer) return undefined;

	const stripeBalance = billingContext.stripeCustomer.balance ?? 0;
	const currency = billingContextToCurrency({ org: ctx.org, billingContext });

	// Flip sign: Stripe stores credit as negative; we surface as positive.
	return {
		balance: stripeToAtmnAmount({ amount: -stripeBalance, currency }),
		currency,
	};
};
