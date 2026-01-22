import { RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * Finds the most recent successful payment intent for a customer.
 */
const findPaymentIntentForRefund = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<string | null> => {
	const paymentIntents = await stripeCli.paymentIntents.list({
		customer: stripeCustomerId,
		limit: 20,
	});

	for (const paymentIntent of paymentIntents.data) {
		if (paymentIntent.status === "succeeded") {
			return paymentIntent.id;
		}
	}

	return null;
};

/**
 * Processes a refund for a negative invoice.
 * Since negative invoices don't have payment intents (they're credits),
 * we find a previous payment intent to refund against.
 */
export const processRefundForNegativeInvoice = async ({
	ctx,
	stripeCli,
	stripeInvoice,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	stripeCustomerId: string;
}): Promise<Stripe.Refund> => {
	const paymentIntentId = await findPaymentIntentForRefund({
		stripeCli,
		stripeCustomerId,
	});

	if (!paymentIntentId) {
		throw new RecaseError({
			message:
				"Cannot issue refund: no previous payment found for this customer",
		});
	}

	const refundAmount = Math.abs(stripeInvoice.total);

	const refund = await stripeCli.refunds.create({
		payment_intent: paymentIntentId,
		amount: refundAmount,
	});

	ctx.logger.info(
		`Created refund ${refund.id} for amount ${refundAmount} (invoice: ${stripeInvoice.id})`,
	);

	return refund;
};
