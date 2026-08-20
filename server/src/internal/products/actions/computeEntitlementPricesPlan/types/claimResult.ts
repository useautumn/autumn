import type { EntitlementPrice, Price } from "@autumn/shared";

/** Claim = definition match. Desired/current are interchangeable for content. */
export type ClaimedEntitlementPrice = {
	desired: EntitlementPrice;
	current: EntitlementPrice;
};

export type ClaimedBasePrice = {
	desired: Price;
	current: Price;
};

export type ClaimResult = {
	entitlementPriceClaims: ClaimedEntitlementPrice[];
	unclaimedDesiredEntitlementPrices: EntitlementPrice[];
	unclaimedCurrentEntitlementPrices: EntitlementPrice[];
	basePriceClaim?: ClaimedBasePrice;
	unclaimedDesiredBasePrice?: Price;
	unclaimedCurrentBasePrice?: Price;
};
