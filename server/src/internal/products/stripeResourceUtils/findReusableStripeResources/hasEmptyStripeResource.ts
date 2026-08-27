import {
	BillingInterval,
	type CurrencyAwarePriceConfig,
	type CurrencyStripeIdSlot,
	getPriceCurrencyStripeId,
	isAllocatedV2Price,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	orgToCurrency,
	type Price,
	priceConfigForCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Consumable + allocated v2 (arrear). Prepaid and allocated v1 stay out. */
export const isReusableUsagePrice = (price: Price) =>
	isConsumablePrice(price) || isAllocatedV2Price(price);

/** Recurring prepaid only — one-off uses inline price_data, not a V2 slot. */
export const isReusablePrepaidPrice = (price: Price) =>
	isPrepaidPrice(price) && price.config.interval !== BillingInterval.OneOff;

export const hasEmptyStripeResource = ({
	ctx,
	targetPrice,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	currency: string;
}): boolean => {
	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const emptyAttachSlot = ({ slot }: { slot: CurrencyStripeIdSlot }) =>
		!getPriceCurrencyStripeId({
			config: targetPrice.config as CurrencyAwarePriceConfig,
			currency,
			orgDefault: orgDefaultCurrency,
			slot,
		});

	if (isFixedPrice(targetPrice)) {
		const { amount } = priceConfigForCurrency({
			config: targetPrice.config,
			currency,
			orgDefault: orgDefaultCurrency,
		});
		if (amount == null || amount <= 0) return false;
		return emptyAttachSlot({ slot: "stripe_price_id" });
	}

	if (isReusablePrepaidPrice(targetPrice)) {
		return emptyAttachSlot({ slot: "stripe_prepaid_price_v2_id" });
	}

	if (!isReusableUsagePrice(targetPrice)) return false;
	return emptyAttachSlot({ slot: "stripe_price_id" });
};
