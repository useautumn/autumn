import { nullish } from "../../../utils.js";
import {
	type CurrencyAwarePriceConfig,
	getAllPriceStripeIds,
} from "@models/productModels/priceModels/priceConfig/priceCurrencyView.js";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import { pricesAreSame } from "../comparePrice/pricesAreSame.js";

// A prepaid price under billing V2 stores its Stripe price in
// `stripe_prepaid_price_v2_id`, so ownership must span every identity slot.
const priceOwnsStripePriceId = ({
	price,
	stripePriceId,
}: {
	price: Price;
	stripePriceId: string;
}): boolean =>
	getAllPriceStripeIds({
		config: price.config as CurrencyAwarePriceConfig,
	}).includes(stripePriceId);

/**
 * Stamp a requested Stripe price id onto a newly built Autumn price only when
 * it still matches that price's definition. A round-tripped id owned by a
 * drifted current row is dropped; an unowned id (sync import) is kept.
 */
export const stripePriceIdForInitializedPrice = ({
	requestedStripePriceId,
	currentPrice,
	newPrice,
}: {
	requestedStripePriceId?: string | null;
	currentPrice?: Price | null;
	newPrice: Price;
}): string | undefined => {
	if (nullish(requestedStripePriceId)) return undefined;
	if (!currentPrice) return requestedStripePriceId;
	if (
		!priceOwnsStripePriceId({
			price: currentPrice,
			stripePriceId: requestedStripePriceId,
		})
	) {
		return requestedStripePriceId;
	}
	if (pricesAreSame(currentPrice, newPrice)) return requestedStripePriceId;
	return undefined;
};
