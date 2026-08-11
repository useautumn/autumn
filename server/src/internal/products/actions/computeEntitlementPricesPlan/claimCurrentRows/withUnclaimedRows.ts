import type { BasePriceAndEntitlementPrices } from "@autumn/shared";
import type {
	ClaimedBasePrice,
	ClaimedEntitlementPrice,
	ClaimResult,
} from "../types/claimResult";

/** Attach leftover desired/current rows that no claim consumed. */
export const withUnclaimedRows = ({
	desired,
	current,
	entitlementPriceClaims,
	basePriceClaim,
}: {
	desired: BasePriceAndEntitlementPrices;
	current: BasePriceAndEntitlementPrices;
	entitlementPriceClaims: ClaimedEntitlementPrice[];
	basePriceClaim?: ClaimedBasePrice;
}): ClaimResult => {
	const claimedDesiredEntIds = new Set(
		entitlementPriceClaims.map((claim) => claim.desired.entitlement.id),
	);
	const claimedCurrentEntIds = new Set(
		entitlementPriceClaims.map((claim) => claim.current.entitlement.id),
	);

	return {
		entitlementPriceClaims,
		unclaimedDesiredEntitlementPrices: desired.entitlementPrices.filter(
			(entitlementPrice) =>
				!claimedDesiredEntIds.has(entitlementPrice.entitlement.id),
		),
		unclaimedCurrentEntitlementPrices: current.entitlementPrices.filter(
			(entitlementPrice) =>
				!claimedCurrentEntIds.has(entitlementPrice.entitlement.id),
		),
		basePriceClaim,
		unclaimedDesiredBasePrice:
			desired.basePrice && !basePriceClaim ? desired.basePrice : undefined,
		unclaimedCurrentBasePrice:
			current.basePrice && !basePriceClaim ? current.basePrice : undefined,
	};
};
