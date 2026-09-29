import type { BillingContext } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { listOpenStripeSubscriptionInvoices } from "@/external/stripe/invoices/operations/listOpenStripeSubscriptionInvoices";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** A past_due subscription is updated in place; its open invoices keep being retried. */
export const fetchPastDueOpenInvoices = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	const { stripeSubscription } = billingContext;
	if (stripeSubscription?.status !== "past_due") return [];

	return listOpenStripeSubscriptionInvoices({
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripeSubscriptionId: stripeSubscription.id,
	});
};
