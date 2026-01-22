import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { processRefundForNegativeInvoice } from "@/internal/billing/v2/providers/stripe/utils/refunds/processRefundFromInvoice";

export const executeStripeRefundAction = async ({
	ctx,
	billingContext,
	stripeInvoice,
	params,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeInvoice: Stripe.Invoice | undefined;
	params?: UpdateSubscriptionV0Params;
}): Promise<void> => {
	const shouldProcessRefund =
		params?.refund_behavior === "refund_payment_method" &&
		stripeInvoice &&
		stripeInvoice.total < 0;

	if (!shouldProcessRefund) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	await processRefundForNegativeInvoice({
		ctx,
		stripeCli,
		stripeInvoice,
		stripeCustomerId: billingContext.stripeCustomer.id,
	});
};
