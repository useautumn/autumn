import type { BillingContext } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
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

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { data } = await stripeCli.invoices.list({
		subscription: stripeSubscription.id,
		status: "open",
	});
	return data;
};
