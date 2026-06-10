import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { updateStripeInvoice } from "./stripeInvoiceOps";

export const applyTemplateToDraft = async ({
	ctx,
	stripeCli,
	invoice,
	footer,
	memo,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	invoice: Stripe.Invoice | undefined;
	footer: string | undefined;
	memo: string | undefined;
}): Promise<Stripe.Invoice | undefined> => {
	if (!invoice || invoice.status !== "draft" || (!footer && !memo)) {
		return invoice;
	}
	ctx.logger.debug(`[execSubAction] Applying invoice template fields`);
	return updateStripeInvoice({
		stripeCli,
		invoiceId: invoice.id,
		params: {
			...(footer ? { footer } : {}),
			...(memo ? { description: memo } : {}),
		},
	});
};
