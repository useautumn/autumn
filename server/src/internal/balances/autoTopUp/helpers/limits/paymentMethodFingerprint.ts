import type Stripe from "stripe";

export const paymentMethodToFingerprint = ({
	paymentMethod,
}: {
	paymentMethod?: Stripe.PaymentMethod | null;
}): string | undefined => {
	if (!paymentMethod) return undefined;

	return paymentMethod.card?.fingerprint ?? paymentMethod.id;
};
