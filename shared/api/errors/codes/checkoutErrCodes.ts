/**
 * Checkout-related error codes
 */
export const CheckoutErrorCode = {
	CheckoutCompleted: "checkout_completed",
	CheckoutExpired: "checkout_expired",
	CheckoutUnavailable: "checkout_unavailable",
} as const;

export type CheckoutErrorCode =
	(typeof CheckoutErrorCode)[keyof typeof CheckoutErrorCode];
