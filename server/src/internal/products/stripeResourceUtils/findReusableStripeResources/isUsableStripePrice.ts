import {
	type CurrencyAwarePriceConfig,
	type FixedPriceConfig,
	type FullProduct,
	getPriceCurrencyStripeId,
	isFixedPrice,
	orgToCurrency,
	type Price,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { stripePriceMatchesFixedPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripePriceMatchesAutumnPrice.js";

export const isUsableStripePrice = async ({
	ctx,
	targetPrice,
	candidate,
	product,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	candidate: Price;
	product: FullProduct;
	currency: string;
}): Promise<boolean> => {
	if (!isFixedPrice(targetPrice)) return false;

	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const stripePriceId = getPriceCurrencyStripeId({
		config: candidate.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot: "stripe_price_id",
	});
	const expectedStripeProductId =
		product.processor?.id ??
		(candidate.config as FixedPriceConfig).stripe_product_id;
	if (!stripePriceId || !expectedStripeProductId) return false;

	const stripePrice = await getStripePrice({
		stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripePriceId,
	});
	if (!stripePrice) return false;

	return stripePriceMatchesFixedPrice({
		stripePrice,
		price: targetPrice,
		stripeProductId: expectedStripeProductId,
		currency,
	});
};
