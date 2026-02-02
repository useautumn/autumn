import { InternalError, tryCatch } from "@autumn/shared";
import Stripe from "stripe";

export async function getStripePrice({
	stripeClient,
	stripePriceId,
	errorOnNotFound = false,
}: {
	stripeClient: Stripe;
	stripePriceId?: string;
	errorOnNotFound?: boolean;
}): Promise<Stripe.Price | undefined> {
	const getStripePriceOptional = async () => {
		if (!stripePriceId) return undefined;

		const { data: stripePrice, error } = await tryCatch(
			stripeClient.prices.retrieve(stripePriceId),
		);

		if (error) {
			if (
				error instanceof Stripe.errors.StripeError &&
				error.code?.includes("resource_missing")
			) {
				return undefined;
			}
			throw error;
		}

		if (stripePrice.deleted) return undefined;

		return stripePrice;
	};

	const stripePrice = await getStripePriceOptional();
	if (!stripePrice && errorOnNotFound) {
		throw new InternalError({
			message: stripePriceId
				? `Stripe price not found: ${stripePriceId}`
				: "Stripe customer id is required.",
		});
	}

	return stripePrice;
}
