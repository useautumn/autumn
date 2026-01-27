import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { nullish } from "@/utils/genUtils.js";

/**
 * Sends an email receipt to the customer by setting `receipt_email` on the PaymentIntent.
 * Stripe automatically sends a receipt email when this field is populated.
 */
export const sendEmailReceipt = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}): Promise<void> => {
	const { stripeCli, logger, fullCustomer } = ctx;
	const { stripeInvoice } = invoicePaidContext;

	// 1. Check if customer exists and has email receipts enabled
	if (!fullCustomer) {
		logger.debug("[invoice.paid] No fullCustomer, skipping email receipt");
		return;
	}

	if (!fullCustomer.send_email_receipts) {
		logger.debug(
			"[invoice.paid] Customer has email receipts disabled, skipping",
		);
		return;
	}

	const customerEmail = fullCustomer.email;
	if (!customerEmail) {
		logger.debug(
			"[invoice.paid] Customer has no email, skipping email receipt",
		);
		return;
	}

	// 2. Extract payment intent ID from the invoice
	const payments = stripeInvoice.payments;
	const firstPayment = payments?.data?.[0];
	const paymentIntentId = firstPayment?.payment?.payment_intent as
		| string
		| undefined;

	if (nullish(paymentIntentId)) {
		logger.debug(
			"[invoice.paid] No payment intent found on invoice, skipping email receipt",
		);
		return;
	}

	try {
		// 3. Check if receipt_email is already set
		const paymentIntent =
			await stripeCli.paymentIntents.retrieve(paymentIntentId);

		if (paymentIntent.receipt_email) {
			logger.debug(
				`[invoice.paid] PaymentIntent ${paymentIntentId} already has receipt_email set, skipping`,
			);
			return;
		}

		// 4. Set receipt_email to trigger Stripe's receipt email
		await stripeCli.paymentIntents.update(paymentIntentId, {
			receipt_email: customerEmail,
		});

		logger.info(
			`[invoice.paid] Set receipt_email for PaymentIntent ${paymentIntentId} to ${customerEmail}`,
		);
	} catch (error) {
		logger.warn(
			`[invoice.paid] Failed to set receipt_email for PaymentIntent ${paymentIntentId}: ${error}`,
		);
	}
};
