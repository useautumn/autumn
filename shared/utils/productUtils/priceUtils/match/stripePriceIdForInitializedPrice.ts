import { nullish } from "../../../utils.js";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import { pricesAreSame } from "../comparePrice/pricesAreSame.js";

const priceOwnedStripePriceId = ({ price }: { price: Price }): string | null => {
	const config = price.config as {
		stripe_price_id?: string | null;
		stripe_prepaid_price_v2_id?: string | null;
	};
	const id = config.stripe_prepaid_price_v2_id || config.stripe_price_id;
	return nullish(id) ? null : id;
};

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
		requestedStripePriceId !== priceOwnedStripePriceId({ price: currentPrice })
	) {
		return requestedStripePriceId;
	}
	if (pricesAreSame(currentPrice, newPrice)) return requestedStripePriceId;
	return undefined;
};
