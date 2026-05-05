/**
 * Describes how an Autumn price/product was matched against a Stripe id.
 * Returned by the find* helpers in this folder so callers know which
 * Stripe id (and which kind) put a given Autumn resource on the candidate
 * list.
 */

export type PriceMatchCondition =
	| { type: "stripe_price_id"; stripe_price_id: string }
	| { type: "stripe_product_id"; stripe_product_id: string };

export type ProductMatchCondition = {
	type: "stripe_product_id";
	stripe_product_id: string;
};
