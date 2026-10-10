// Stripe has used both wordings for the same refusal; its error code is not documented.
const PENDING_PAYMENT_MESSAGES = [
	"pending payments waiting to clear",
	"payment on it is still pending",
];

/** Stripe refuses to void or modify an invoice while a payment on it is still processing. */
export const isStripePendingPaymentError = (error: unknown): boolean =>
	error instanceof Error &&
	PENDING_PAYMENT_MESSAGES.some((message) => error.message.includes(message));
