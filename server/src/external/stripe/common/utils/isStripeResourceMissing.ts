import Stripe from "stripe";

/** Stripe has no object with that id: deleted, or it lives on another Stripe account. */
export const isStripeResourceMissing = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "resource_missing";
