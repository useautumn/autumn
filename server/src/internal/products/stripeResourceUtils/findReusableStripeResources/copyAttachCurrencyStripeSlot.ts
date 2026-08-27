import {
	type CurrencyAwarePriceConfig,
	type CurrencyStripeIdSlot,
	getPriceCurrencyStripeId,
	type Price,
	setPriceCurrencyStripeId,
} from "@autumn/shared";

export const copyAttachCurrencyStripeSlot = ({
	targetPrice,
	sourcePrice,
	currency,
	orgDefaultCurrency,
	slot = "stripe_price_id",
}: {
	targetPrice: Price;
	sourcePrice: Price;
	currency: string;
	orgDefaultCurrency: string;
	slot?: CurrencyStripeIdSlot;
}): boolean => {
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
