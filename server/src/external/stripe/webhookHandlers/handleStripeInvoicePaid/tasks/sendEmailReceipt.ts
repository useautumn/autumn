import { stripeInvoiceIdToPaymentIntent } from "@/external/stripe/invoices/utils/convertStripeInvoice.js";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";

export const sendEmailReceipt = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}): Promise<void> => {
	const { stripeCli, logger, fullCustomer } = ctx;
	const { stripeInvoice } = invoicePaidContext;

	const stripeCustomerId = fullCustomer?.processor?.id;
	if (!stripeCustomerId) {
		logger.debug(
			"[invoice.paid] Customer has no Stripe ID, skipping email receipt",
		);
		return;
	}

	const stripeCustomer = await stripeCli.customers.retrieve(stripeCustomerId);

	if (!stripeCustomer) {
		logger.debug("[invoice.paid] No stripeCustomer, skipping email receipt");
		return;
	}
	if (stripeCustomer.deleted) {
		logger.debug(
			"[invoice.paid] Stripe customer is deleted, skipping email receipt",
		);
		return;
	}

	if (!fullCustomer?.send_email_receipts) {
		logger.debug(
			"[invoice.paid] Customer has email receipts disabled, skipping",
		);
		return;
	}

	const customerEmail = stripeCustomer.email;

	if (!customerEmail) {
		logger.debug(
			"[invoice.paid] Customer has no email, skipping email receipt",
		);
		return;
	}

	const paymentIntentId = await stripeInvoiceIdToPaymentIntent({
		stripeClient: stripeCli,
		invoiceId: stripeInvoice.id,
	});

	if (!paymentIntentId) {
		logger.debug(
			"[invoice.paid] No payment intent found on invoice, skipping email receipt",
		);
		return;
	}

	try {
		const paymentIntent =
			await stripeCli.paymentIntents.retrieve(paymentIntentId);

		if (paymentIntent.receipt_email) {
			logger.debug(
				`[invoice.paid] PaymentIntent ${paymentIntentId} already has receipt_email set, skipping`,
			);
			return;
		}

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
