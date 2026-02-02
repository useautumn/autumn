import {
	InternalError,
	type LineItemContext,
	type Organization,
	orgToCurrency,
	priceIsTieredOneOff,
	type StripeItemSpec,
	type UsagePriceConfig,
	usagePriceToLineItem,
} from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Update one-off items to use inline price_data if they're tiered.
 * Stripe doesn't support one-off tiered prices, so we calculate the amount
 * and create an inline price instead.
 */
export const updateOneOffTieredItems = ({
	oneOffItemSpecs,
	org,
}: {
	oneOffItemSpecs: StripeItemSpec[];
	org: Organization;
}): Stripe.Checkout.SessionCreateParams.LineItem[] => {
	const currency = orgToCurrency({ org });

	return oneOffItemSpecs.map((item) => {
		const { autumnPrice, autumnProduct, autumnCusEnt } = item;

		// If missing price/product or not tiered one-off, use the regular price ID
		if (
			!autumnPrice ||
			!autumnProduct ||
			!priceIsTieredOneOff({ price: autumnPrice, product: autumnProduct })
		) {
			return {
				price: item.stripePriceId,
				quantity: item.quantity ?? 1,
			};
		}

		if (!autumnCusEnt) {
			throw new InternalError({
				message: `Tiered one-off price ${autumnPrice.id} has no customer entitlement`,
			});
		}

		// Build context for line item
		const context: LineItemContext = {
			price: autumnPrice,
			product: autumnProduct,
			feature: autumnCusEnt.entitlement.feature,
			currency,
			direction: "charge",
			now: Date.now(),
			billingTiming: "in_advance",
		};

		// Use usagePriceToLineItem to get amount and description
		const lineItem = usagePriceToLineItem({
			cusEnt: autumnCusEnt,
			context,
		});

		// Get the stripe product ID from the price config
		const config = autumnPrice.config as UsagePriceConfig;
		const stripeProductId = config.stripe_product_id;

		if (!stripeProductId) {
			throw new InternalError({
				message: `Tiered one-off price ${autumnPrice.id} has no stripe_product_id`,
			});
		}

		return {
			price_data: {
				product_data: {
					name: lineItem.description,
				},
				unit_amount: Math.round(lineItem.amount * 100),
				currency,
			},
			quantity: 1,
		};
	});
};
