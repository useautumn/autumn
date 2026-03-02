import type { Stripe } from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const voidStripeInvoiceIfOpen = async ({
	ctx,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	stripeInvoice?: Stripe.Invoice;
}): Promise<Stripe.Invoice | undefined> => {
	if (!stripeInvoice) return;

	if (stripeInvoice.status !== "open") return;

	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });
	const voidedInvoice = await stripeCli.invoices.voidInvoice(stripeInvoice.id);
	return voidedInvoice;
};
