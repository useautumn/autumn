import type { Price } from "@models/productModels/priceModels/priceModels";

/** The identity a price is matched on across definitions (mirrors
 * diffPlanV1's composeMatchKey): feature + billing method + interval. */
const priceMatchKey = (price: Price): string => {
	const interval = price.config.interval ?? "";
	const intervalCount = interval ? (price.config.interval_count ?? 1) : "";
	return `${price.config.feature_id ?? ""}|${price.billing_type ?? ""}|${interval}|${intervalCount}`;
};

/**
 * Strict 1:1 successor: exactly one unclaimed candidate shares the source's
 * match key, else undefined — ambiguous (0 or 2+) matches never guess.
 */
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
