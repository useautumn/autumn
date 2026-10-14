import Stripe from "stripe";

export const isStripeResourceMissing = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "resource_missing";
