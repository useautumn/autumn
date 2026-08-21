import {
	type EntitlementPrice,
	EntitlementPriceMatchPrecision,
	findEntitlementPriceSuccessor,
	priceCurrencyDefinitionsAreSame,
} from "@autumn/shared";
import type { ClaimedEntitlementPrice } from "../types/claimResult";

/** Each current EP claims one desired EP that matches at definition precision. */
export const claimEntitlementPrices = ({
	desiredEntitlementPrices,
	currentEntitlementPrices,
}: {
	desiredEntitlementPrices: EntitlementPrice[];
	currentEntitlementPrices: EntitlementPrice[];
}): ClaimedEntitlementPrice[] => {
	const claims: ClaimedEntitlementPrice[] = [];
	const claimedDesiredEntIds = new Set<string>();

	for (const current of currentEntitlementPrices) {
		const desired = findEntitlementPriceSuccessor({
			sourceEntitlementPrice: current,
			candidateEntitlementPrices: desiredEntitlementPrices.filter(
				(candidate) => {
					if (claimedDesiredEntIds.has(candidate.entitlement.id)) return false;
					if (!current.price || !candidate.price) {
						return !current.price && !candidate.price;
					}
					return priceCurrencyDefinitionsAreSame(
						current.price,
						candidate.price,
					);
				},
			),
			matchPrecisions: [
				EntitlementPriceMatchPrecision.EntitlementAndPriceDefinition,
			],
		});
		if (!desired) continue;

		claims.push({ desired, current });
		claimedDesiredEntIds.add(desired.entitlement.id);
	}

	return claims;
};
