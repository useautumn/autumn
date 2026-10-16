import {
	cusProductToPrices,
	type FullCusProduct,
	isPayPerUsePrice,
	type Price,
} from "@autumn/shared";

const payPerUseFeatureIds = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) =>
	new Set(
		customerProducts
			.flatMap((cusProduct) => cusProductToPrices({ cusProduct }))
			.filter((price: Price) => isPayPerUsePrice({ price }))
			.map((price) => price.config.feature_id),
	);

/** Usage billed in arrears shows up in no total, so a newly metered feature is a charge of its own. */
export const changeAddsPayPerUsePrice = ({
	incoming,
	outgoing,
}: {
	incoming: FullCusProduct[];
	outgoing: FullCusProduct[];
}): boolean => {
	const alreadyMetered = payPerUseFeatureIds({ customerProducts: outgoing });
	return [...payPerUseFeatureIds({ customerProducts: incoming })].some(
		(featureId) => !alreadyMetered.has(featureId),
	);
};
