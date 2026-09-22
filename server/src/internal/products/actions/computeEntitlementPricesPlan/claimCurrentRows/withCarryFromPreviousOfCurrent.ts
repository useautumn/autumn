import {
	type BasePriceAndEntitlementPrices,
	type EntitlementPrice,
	findEntitlementPriceSuccessor,
} from "@autumn/shared";

/**
 * No API field states `carry_from_previous`; the mint derives it from the
 * feature. A stored row holding the other value keeps it — the request had
 * no way to ask for the change — so the pair can claim as `same`.
 */
export const withCarryFromPreviousOfCurrent = ({
	desired,
	current,
}: {
	desired: BasePriceAndEntitlementPrices;
	current: BasePriceAndEntitlementPrices;
}): BasePriceAndEntitlementPrices => {
	// Strongest match first (exact definition), then price identity, interval,
	// feature: an edited allowance still finds the row it is editing.
	const taken = new Set<string>();
	const entitlementPrices = desired.entitlementPrices.map(
		(entitlementPrice): EntitlementPrice => {
			const match = findEntitlementPriceSuccessor({
				sourceEntitlementPrice: entitlementPrice,
				candidateEntitlementPrices: current.entitlementPrices,
				excludedEntitlementIds: taken,
			});
			if (!match) return entitlementPrice;
			taken.add(match.entitlement.id);
			return {
				...entitlementPrice,
				entitlement: {
					...entitlementPrice.entitlement,
					carry_from_previous: match.entitlement.carry_from_previous,
				},
			};
		},
	);
	return { ...desired, entitlementPrices };
};
