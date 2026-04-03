import { Decimal } from "decimal.js";

import type { BillingInterval } from "../../models/productModels/intervals/billingInterval";
import type { Price } from "../../models/productModels/priceModels/priceModels";
import {
	compareBillingIntervals,
	getLargestInterval,
} from "../intervalUtils/priceIntervalUtils";
import { intervalToValue } from "../intervalUtils";
import { nullish } from "../utils";
import {
	isFreeProduct,
	isOneOffProduct,
} from "./classifyProduct/classifyProductUtils";
import { isConsumablePrice } from "./priceUtils/classifyPriceUtils";

/** Gets the raw amount from a price (fixed amount or first usage tier amount). */
const getPriceAmount = ({ price }: { price: Price }): number => {
	if ("usage_tiers" in price.config) {
		const tiers = price.config.usage_tiers;
		if (nullish(tiers) || tiers.length === 0) return 0;
		return tiers[0].amount;
	}
	return price.config.amount;
};

/** Normalizes a price to a monthly rate using Decimal.js for precision. */
const normalizeToMonthlyRate = ({ price }: { price: Price }): Decimal => {
	const amount = new Decimal(getPriceAmount({ price }));
	const months = intervalToValue(
		price.config.interval as BillingInterval,
		price.config.interval_count,
	);
	if (months === 0) return amount;
	return amount.div(months);
};

/** Sums normalized monthly rates for all non-consumable prices. */
const getNormalizedTotal = ({ prices }: { prices: Price[] }): Decimal => {
	let total = new Decimal(0);
	for (const price of prices) {
		if (isConsumablePrice(price)) continue;
		total = total.plus(normalizeToMonthlyRate({ price }));
	}
	return total;
};

export const isProductUpgrade = ({
	prices1,
	prices2,
	usageAlwaysUpgrade = true,
}: {
	prices1: Price[];
	prices2: Price[];
	usageAlwaysUpgrade?: boolean;
}) => {
	const prod1IsFree = isFreeProduct({ prices: prices1 });
	const prod2IsFree = isFreeProduct({ prices: prices2 });

	if (prod1IsFree && !prod2IsFree) return true;
	if (!prod1IsFree && prod2IsFree) return false;

	if (
		isOneOffProduct({ prices: prices2 }) ||
		isOneOffProduct({ prices: prices1 })
	)
		return true;

	if (
		prices1.every(isConsumablePrice) &&
		prices2.every(isConsumablePrice) &&
		usageAlwaysUpgrade
	) {
		return true;
	}

	const billingInterval1 = getLargestInterval({ prices: prices1 });
	const billingInterval2 = getLargestInterval({ prices: prices2 });

	if (billingInterval1 && billingInterval2) {
		const cmp = compareBillingIntervals({
			configA: billingInterval1,
			configB: billingInterval2,
		});
		if (cmp > 0) return true;
	}

	const total1 = getNormalizedTotal({ prices: prices1 });
	const total2 = getNormalizedTotal({ prices: prices2 });

	return total1.lte(total2);
};
