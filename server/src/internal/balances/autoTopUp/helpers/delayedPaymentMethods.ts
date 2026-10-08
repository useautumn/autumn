import type Stripe from "stripe";

/** Non-exhaustive: only types Stripe documents as delayed-notification, blocked before charging.
 * Any other type that comes back `processing` is caught by the delayed-payment suspension in autoTopup. */
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
