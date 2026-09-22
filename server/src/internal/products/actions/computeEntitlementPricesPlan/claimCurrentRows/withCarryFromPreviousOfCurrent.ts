import {
	type BasePriceAndEntitlementPrices,
	type EntitlementPrice,
	normalizedEntitlementInterval,
	normalizedEntitlementIntervalCount,
} from "@autumn/shared";

const sameSlot = (a: EntitlementPrice, b: EntitlementPrice): boolean =>
	a.entitlement.internal_feature_id === b.entitlement.internal_feature_id &&
	normalizedEntitlementInterval(a.entitlement) ===
		normalizedEntitlementInterval(b.entitlement) &&
	normalizedEntitlementIntervalCount(a.entitlement) ===
		normalizedEntitlementIntervalCount(b.entitlement);

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
	const taken = new Set<string>();
	const entitlementPrices = desired.entitlementPrices.map(
		(entitlementPrice): EntitlementPrice => {
			const match = current.entitlementPrices.find(
				(candidate) =>
					!taken.has(candidate.entitlement.id) &&
					sameSlot(candidate, entitlementPrice),
			);
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
