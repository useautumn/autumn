import type Stripe from "stripe";

/**
 * Identifies the *card* rather than the payment method object, so that
 * re-attaching the same declining card (which mints a new payment method id)
 * is not mistaken for the customer providing new payment info.
 *
 * Falls back to the payment method id for payment method types that carry no
 * fingerprint — worst case the customer gets one more attempt, which is the
 * safer direction to fail.
 */
export const paymentMethodToFingerprint = ({
	paymentMethod,
}: {
	paymentMethod?: Stripe.PaymentMethod | null;
}): string | undefined => {
	if (!paymentMethod) return undefined;

	return paymentMethod.card?.fingerprint ?? paymentMethod.id;
};
