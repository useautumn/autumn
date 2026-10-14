import type Stripe from "stripe";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";

export const chargeProrationInvoiceNow = async ({
	ctx,
	stripeCli,
	sub,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	sub: Stripe.Subscription;
}) => {
	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: sub.customer as string,
	});
	const { invoice } = await createAndFinalizeInvoice({
		stripeCli,
		paymentMethod,
		stripeCusId: sub.customer as string,
		stripeSubId: sub.id,
		logger: ctx.logger,
	});
	return invoice;
};
