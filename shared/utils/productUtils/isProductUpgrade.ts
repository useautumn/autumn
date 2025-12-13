import { Decimal } from "decimal.js";
import { intervalsSame, isConsumablePayPerUsePrice, nullish } from "../..";
import type { Price } from "../../models/productModels/priceModels/priceModels";
import {
	compareBillingIntervals,
	getLargestInterval,
} from "../intervalUtils/priceIntervalUtils";
import { isFreeProduct } from "./classifyProductUtils";

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

	// 1. If one product is free and the other is not, then free -> paid is an upgrade
	if (prod1IsFree && prod2IsFree) return true;
	if (prod1IsFree && !prod2IsFree) return true;
	if (!prod1IsFree && prod2IsFree) return false;

	if (
		prices1.every((p) => isConsumablePayPerUsePrice({ price: p })) &&
		prices2.every((p) => isConsumablePayPerUsePrice({ price: p })) &&
		usageAlwaysUpgrade
	) {
		return true;
	}

	const billingInterval1 = getLargestInterval({ prices: prices1 }); // pro quarter
	const billingInterval2 = getLargestInterval({ prices: prices2 }); // premium

	// Billing is nullish if there's a free product. Should not happen!
	if (nullish(billingInterval1) || nullish(billingInterval2)) return false;

	// 2. Get total price for each product
	const getTotalPrice = (prices: Price[]) => {
		let totalPrice = new Decimal(0);
		for (const price of prices) {
			if ("usage_tiers" in price.config) {
				const tiers = price.config.usage_tiers;
				if (nullish(tiers) || tiers.length === 0) continue;
				totalPrice = totalPrice.plus(tiers[0].amount);
			} else {
				totalPrice = totalPrice.plus(price.config.amount);
			}
		}
		return totalPrice.toNumber();
	};

	// 3. Compare prices

	if (
		intervalsSame({
			intervalA: billingInterval1,
			intervalB: billingInterval2,
		})
	) {
		return getTotalPrice(prices1) < getTotalPrice(prices2);
	} else {
		return (
			compareBillingIntervals({
				configA: billingInterval1,
				configB: billingInterval2,
			}) > 0
		);
	}
};
