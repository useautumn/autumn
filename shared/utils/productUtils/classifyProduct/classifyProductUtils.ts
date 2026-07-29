import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { type FullProduct, notNullish, nullish } from "../../../index.js";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { PriceType } from "../../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import { productToEffectivePrices } from "../convertProduct/productToEffectivePrices";

// TODO: Write unit tests for these functions (?)

type ProductPriceSource = { prices: Price[] } | { product: FullProduct };

const sourceToPrices = (source: ProductPriceSource) =>
	"product" in source
		? productToEffectivePrices({ product: source.product })
		: source.prices;

export const isOneOffProduct = (source: ProductPriceSource) => {
	const prices = sourceToPrices(source);
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

export const isFreeProduct = (source: ProductPriceSource) => {
	const prices = sourceToPrices(source);
	if (prices.length === 0) {
		return true;
	}

	let totalPrice = 0;
	for (const price of prices) {
		if ("usage_tiers" in price.config && notNullish(price.config.usage_tiers)) {
			const tiers = price.config.usage_tiers;
			if (nullish(tiers) || tiers.length === 0) continue;
			totalPrice += tiers.reduce(
				(acc, tier) => acc + tier.amount + (tier.flat_amount ?? 0),
				0,
			);
		} else if ("amount" in price.config && notNullish(price.config.amount)) {
			totalPrice += price.config.amount ?? 0;
		}
	}
	return totalPrice === 0;
};

export const isOneOffOrAddOnProduct = ({
	product,
}: {
	product: FullProduct;
}) => {
	return isOneOffProduct({ product }) || product.is_add_on;
};
