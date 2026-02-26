import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { type FullProduct, nullish } from "../../../index.js";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { PriceType } from "../../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";

// TODO: Write unit tests for these functions (?)

export const isOneOffProduct = ({ prices }: { prices: Price[] }) => {
	return (
		prices.every((p) => p.config?.interval === BillingInterval.OneOff) &&
		prices.some((p) => {
			if (p.config?.type === PriceType.Usage) {
				const config = p.config as UsagePriceConfig;
				return config.usage_tiers.some((t) => t.amount > 0);
			} else {
				const config = p.config as FixedPriceConfig;
				return config.amount > 0;
			}
		})
	);
};

export const isFreeProduct = ({ prices }: { prices: Price[] }) => {
	if (prices.length === 0) {
		return true;
	}

	let totalPrice = 0;
	for (const price of prices) {
		if ("usage_tiers" in price.config) {
			const tiers = price.config.usage_tiers;
			if (nullish(tiers) || tiers.length === 0) continue;
			totalPrice += tiers.reduce(
				(acc, tier) => acc + tier.amount + (tier.flat_amount ?? 0),
				0,
			);
		} else {
			totalPrice += price.config.amount;
		}
	}
	return totalPrice === 0;
};

export const isOneOffOrAddOnProduct = ({
	product,
}: {
	product: FullProduct;
}) => {
	return isOneOffProduct({ prices: product.prices }) || product.is_add_on;
};
