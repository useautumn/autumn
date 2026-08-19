import {
	type BasePriceAndEntitlementPrices,
	pricesAndEntitlementsToBasePriceAndEntitlementPrices,
} from "@autumn/shared";
import type { ClaimResult } from "../types/claimResult";
import type { ComputeEntitlementPricesPlanParams } from "../types/computeEntitlementPricesPlanParams";
import { claimBasePrice } from "./claimBasePrice";
import { claimEntitlementPrices } from "./claimEntitlementPrices";
import { withUnclaimedRows } from "./withUnclaimedRows";

/** Pair desired rows to current rows via definition / successor match. */
export const claimCurrentRows = ({
	params,
	desiredBasePriceAndEntitlementPrices,
}: {
	params: ComputeEntitlementPricesPlanParams;
	desiredBasePriceAndEntitlementPrices: BasePriceAndEntitlementPrices;
}): ClaimResult => {
	// Version mints every desired row; current stays on the old version.
	if (params.mode.type === "version") {
		return {
			entitlementPriceClaims: [],
			unclaimedDesiredEntitlementPrices:
				desiredBasePriceAndEntitlementPrices.entitlementPrices,
			unclaimedCurrentEntitlementPrices: [],
			unclaimedDesiredBasePrice: desiredBasePriceAndEntitlementPrices.basePrice,
			unclaimedCurrentBasePrice: undefined,
		};
	}

	const current = pricesAndEntitlementsToBasePriceAndEntitlementPrices({
		prices: params.currentRows?.prices ?? [],
		entitlements: params.currentRows?.entitlements ?? [],
	});

	const basePriceClaim = claimBasePrice({
		desiredBasePrice: desiredBasePriceAndEntitlementPrices.basePrice,
		currentBasePrice: current.basePrice,
	});

	const entitlementPriceClaims = claimEntitlementPrices({
		desiredEntitlementPrices:
			desiredBasePriceAndEntitlementPrices.entitlementPrices,
		currentEntitlementPrices: current.entitlementPrices,
	});

	return withUnclaimedRows({
		desired: desiredBasePriceAndEntitlementPrices,
		current,
		entitlementPriceClaims,
		basePriceClaim,
	});
};
