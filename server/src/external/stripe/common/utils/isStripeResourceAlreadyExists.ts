import Stripe from "stripe";

export const isStripeResourceAlreadyExists = (error: unknown): boolean =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "resource_already_exists";
