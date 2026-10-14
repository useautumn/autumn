import type { Price } from "@models/productModels/priceModels/priceModels";
import { getBillingType } from "@utils/productUtils/priceUtils.js";

const priceMatchKey = (price: Price): string => {
	const interval = price.config.interval ?? "";
	const intervalCount = interval ? (price.config.interval_count ?? 1) : "";
	return `${price.config.feature_id ?? ""}|${getBillingType(price.config)}|${interval}|${intervalCount}`;
};

export const findPriceSuccessor = ({
	sourcePrice,
	candidatePrices,
	excludedPriceIds,
}: {
	sourcePrice: Price;
	candidatePrices: Price[];
	excludedPriceIds?: Set<string>;
}): Price | undefined => {
	const sourceKey = priceMatchKey(sourcePrice);
	const matches = candidatePrices.filter(
		(candidatePrice) =>
			!excludedPriceIds?.has(candidatePrice.id) &&
			priceMatchKey(candidatePrice) === sourceKey,
	);
	return matches.length === 1 ? matches[0] : undefined;
};
