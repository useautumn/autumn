import {
	type BasePriceAndEntitlementPrices,
	type EntitlementPrice,
	entitlementPricesAreSame,
} from "@autumn/shared";

/** The definition match the claim uses, with carry_from_previous held equal. */
const sameDefinitionIgnoringCarry = (
	a: EntitlementPrice,
	b: EntitlementPrice,
): boolean =>
	entitlementPricesAreSame({
		entitlementPrice1: a,
		entitlementPrice2: {
			...b,
			entitlement: {
				...b.entitlement,
				carry_from_previous: a.entitlement.carry_from_previous,
			},
		},
	});

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
					sameDefinitionIgnoringCarry(candidate, entitlementPrice),
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
