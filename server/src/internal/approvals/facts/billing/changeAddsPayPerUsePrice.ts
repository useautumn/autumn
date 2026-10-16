import {
	cusProductToEnts,
	cusProductToPrices,
	type FullCusProduct,
	isPayPerUsePrice,
	priceToEnt,
} from "@autumn/shared";

/** Each metered feature's usage terms (price config plus included usage), keyed so two plans can be compared. */
const payPerUseTerms = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) =>
	new Set(
		customerProducts.flatMap((cusProduct) => {
			const entitlements = cusProductToEnts({ cusProduct });
			return cusProductToPrices({ cusProduct })
				.filter((price) => isPayPerUsePrice({ price }))
				.map((price) => {
					const entitlement = priceToEnt({ price, entitlements });
					return JSON.stringify({
						config: price.config,
						included: entitlement?.allowance ?? null,
						included_interval: entitlement?.interval ?? null,
					});
				});
		}),
	);

/**
 * Usage billed in arrears shows up in no total, so a newly metered feature, or a
 * metered feature on new terms, is a charge of its own. Any new terms count: when unsure, paid.
 */
export const changeAddsPayPerUsePrice = ({
	incoming,
	outgoing,
}: {
	incoming: FullCusProduct[];
	outgoing: FullCusProduct[];
}): boolean => {
	const existingTerms = payPerUseTerms({ customerProducts: outgoing });
	return [...payPerUseTerms({ customerProducts: incoming })].some(
		(terms) => !existingTerms.has(terms),
	);
};
