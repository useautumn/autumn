import type Stripe from "stripe";

/** Stripe documents these as delayed-notification: charges sit in `processing` for days. */
export const DELAYED_PAYMENT_METHOD_TYPES = new Set<string>([
	"us_bank_account",
	"sepa_debit",
	"bacs_debit",
	"au_becs_debit",
	"nz_bank_account",
	"acss_debit",
	"customer_balance",
	"payto",
	"boleto",
	"pix",
	"sofort",
	"oxxo",
]);

export const DELAYED_PAYMENT_SUSPENDED_REASON = "delayed_payment_method";

export const isDelayedPaymentMethod = ({
	paymentMethod,
}: {
	paymentMethod?: Stripe.PaymentMethod | null;
}) =>
	Boolean(
		paymentMethod && DELAYED_PAYMENT_METHOD_TYPES.has(paymentMethod.type),
	);
