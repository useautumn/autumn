import type { Stripe } from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invoiceActions } from "@/internal/invoices/actions";

export const voidStripeInvoiceIfOpen = async ({
	ctx,
	stripeInvoice,
	source = "allocatedInvoice",
}: {
	ctx: AutumnContext;
	stripeInvoice?: Stripe.Invoice;
	source?: "autoTopup" | "allocatedInvoice";
}): Promise<Stripe.Invoice | undefined> => {
	if (!stripeInvoice) return;

	if (stripeInvoice.status !== "open") return;

	const { org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });
	const voidedInvoice = await stripeCli.invoices.voidInvoice(stripeInvoice.id);

	await invoiceActions.updateFromStripe({
		ctx,
		customerId: ctx.customerId ?? "",
		stripeInvoice: voidedInvoice,
	});

	logger.info(
		`[voidStripeInvoiceIfOpen] Voided invoice ${stripeInvoice.id} from ${source}`,
	);
	return voidedInvoice;
};
