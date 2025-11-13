import { BillingInterval } from "../../../models/productModels/intervals/billingInterval.js";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
	BillingType,
	PriceType,
} from "../../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import type { Product } from "../../../models/productModels/productModels.js";
import { getBillingType } from "../priceUtils.js";

export const formatPrice = ({
	price,
	product,
}: {
	price: Price;
	product?: Product;
}) => {
	if (price.config.type === PriceType.Fixed) {
		const config = price.config as FixedPriceConfig;
		const formatted = `${config.amount}${config.interval === BillingInterval.OneOff ? "(one off)" : `/ ${config.interval}`}`;
		if (product) {
			return `${product.name} - ${formatted}`;
		}
		return formatted;
	} else {
		const config = price.config as UsagePriceConfig;
		const billingType = getBillingType(config);
		const formatBillingType = {
			[BillingType.UsageInAdvance]: "prepaid",
			[BillingType.UsageInArrear]: "usage",
			[BillingType.InArrearProrated]: "cont_use",
			[BillingType.FixedCycle]: "cont_use",
		};

		const featureId = config.feature_id;

		const formatted = `${formatBillingType[billingType as keyof typeof formatBillingType]} price for feature ${featureId}: $${config.usage_tiers[0].amount}${config.billing_units ? ` ${config.billing_units}` : ""}`;
		if (product) {
			return `${product.name} - ${formatted}`;
		}
		return formatted;
	}
};

export const logPrices = ({
	prices,
	prefix,
}: {
	prices: Price[];
	prefix?: string;
}) => {
	if (prefix) {
		console.log(`${prefix}:`);
	}
	for (const price of prices) {
		console.log(`${price.id} - ${formatPrice({ price })}`);
	}
};
