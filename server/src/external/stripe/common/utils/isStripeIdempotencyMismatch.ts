import Stripe from "stripe";

/** Stripe already saw this idempotency key with different request params. */
export const isStripeIdempotencyMismatch = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeIdempotencyError;
