import Stripe from "stripe";

/** Stripe already has an object with the id the request chose. */
export const isStripeResourceAlreadyExists = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "resource_already_exists";
