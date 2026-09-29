import { stripeCustomerId } from "@tests/utils/stripeUtils/stripeCustomerId";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";

/** The customer's open Stripe invoice: the one a hosted invoice checkout is about to pay. */
export const openStripeInvoiceId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<string> => {
	const invoices = await ctx.stripeCli.invoices.list({
		customer: await stripeCustomerId({ ctx, customerId }),
		status: "open",
		limit: 1,
	});
	const invoiceId = invoices.data[0]?.id;
	if (!invoiceId) throw new Error(`No open Stripe invoice for ${customerId}`);
	return invoiceId;
};
