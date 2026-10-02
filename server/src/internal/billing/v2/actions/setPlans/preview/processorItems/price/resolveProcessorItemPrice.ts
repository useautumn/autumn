import type { ProcessorItemPrice } from "@autumn/shared";
import type { AutumnStripePrice } from "../types/autumnStripePriceIndex";
import type { ProcessorItemContext } from "../types/processorItemContext";
import { autumnPriceToProcessorItemPrice } from "./autumnPriceToProcessorItemPrice";
import {
	type InlinePriceData,
	inlinePriceDataToProcessorItemPrice,
} from "./inlinePriceDataToProcessorItemPrice";
import { stripePriceToProcessorItemPrice } from "./stripePriceToProcessorItemPrice";

/** Prefer what Stripe will actually bill; fall back to Autumn's config for prices not yet in Stripe. */
export const resolveProcessorItemPrice = ({
	stripePriceId,
	inlinePriceData,
	autumnStripePrice,
	context,
}: {
	stripePriceId?: string;
	inlinePriceData?: InlinePriceData;
	autumnStripePrice?: AutumnStripePrice;
	context: ProcessorItemContext;
}): ProcessorItemPrice | null => {
	if (inlinePriceData)
		return inlinePriceDataToProcessorItemPrice(inlinePriceData);

	const stripePrice = stripePriceId
		? context.stripePrices.get(stripePriceId)
		: undefined;
	if (stripePrice) return stripePriceToProcessorItemPrice(stripePrice);

	if (autumnStripePrice) {
		return autumnPriceToProcessorItemPrice({
			price: autumnStripePrice.price,
			entitlement: autumnStripePrice.entitlement,
			org: context.org,
			currency: context.currency,
		});
	}

	return null;
};
