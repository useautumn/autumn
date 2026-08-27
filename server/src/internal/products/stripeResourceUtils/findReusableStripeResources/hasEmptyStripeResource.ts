import {
	type CurrencyAwarePriceConfig,
	getPriceCurrencyStripeId,
	isFixedPrice,
	orgToCurrency,
	type Price,
	priceConfigForCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const hasEmptyStripeResource = ({
	ctx,
	targetPrice,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	currency: string;
}): boolean => {
	if (!isFixedPrice(targetPrice)) return false;

	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const { amount } = priceConfigForCurrency({
		config: targetPrice.config,
		currency,
		orgDefault: orgDefaultCurrency,
	});
	if (amount == null || amount <= 0) return false;

	return !getPriceCurrencyStripeId({
		config: targetPrice.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot: "stripe_price_id",
	});
};
