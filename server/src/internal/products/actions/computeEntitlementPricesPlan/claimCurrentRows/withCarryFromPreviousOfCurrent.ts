import {
	type BasePriceAndEntitlementPrices,
	type EntitlementPrice,
	findEntitlementPriceSuccessor,
} from "@autumn/shared";

export const withCarryFromPreviousOfCurrent = ({
	desired,
	current,
}: {
	desired: BasePriceAndEntitlementPrices;
	current: BasePriceAndEntitlementPrices;
}): BasePriceAndEntitlementPrices => {
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
