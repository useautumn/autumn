import {
	type CurrencyAwarePriceConfig,
	getPriceCurrencyStripeId,
	type Price,
	setPriceCurrencyStripeId,
} from "@autumn/shared";

export const copyAttachCurrencyStripeSlot = ({
	targetPrice,
	sourcePrice,
	currency,
	orgDefaultCurrency,
}: {
	targetPrice: Price;
	sourcePrice: Price;
	currency: string;
	orgDefaultCurrency: string;
}): boolean => {
	const slot = "stripe_price_id" as const;
	const sourceId = getPriceCurrencyStripeId({
		config: sourcePrice.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot,
	});
	if (!sourceId) return false;

	const targetId = getPriceCurrencyStripeId({
		config: targetPrice.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot,
	});
	if (targetId) return false;

	setPriceCurrencyStripeId({
		config: targetPrice.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot,
		id: sourceId,
	});
	return true;
};
