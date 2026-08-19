import type { ClaimResult } from "../types/claimResult";
import type { EntitlementPricesPlanMode } from "../types/computeEntitlementPricesPlanParams";
import {
	emptyEntitlementPricesPlan,
	type EntitlementPricesPlan,
} from "../types/entitlementPricesPlan";
import {
	leaveBucketForMode,
	pushEntitlementPrice,
	withFreshIds,
	withFreshPriceId,
} from "./buildEntitlementPricesPlanUtils";

/**
 * Claims → same; unclaimed desired → new; unclaimed current → leave bucket by mode.
 * Version/custom ignore leaving; custom stamps is_custom on inserts.
 */
export const buildEntitlementPricesPlan = ({
	mode,
	claims,
}: {
	mode: EntitlementPricesPlanMode;
	claims: ClaimResult;
}): EntitlementPricesPlan => {
	const plan = emptyEntitlementPricesPlan();

	const isCustom = mode.type === "custom";
	const leaveBucket = leaveBucketForMode({ mode });

	for (const { current } of claims.entitlementPriceClaims) {
		pushEntitlementPrice({
			plan,
			bucket: "same",
			entitlementPrice: current,
		});
	}

	for (const entitlementPrice of claims.unclaimedDesiredEntitlementPrices) {
		pushEntitlementPrice({
			plan,
			bucket: "new",
			entitlementPrice: withFreshIds({ entitlementPrice, isCustom }),
		});
	}

	if (leaveBucket) {
		for (const entitlementPrice of claims.unclaimedCurrentEntitlementPrices) {
			pushEntitlementPrice({
				plan,
				bucket: leaveBucket,
				entitlementPrice,
			});
		}
	}

	if (claims.basePriceClaim) {
		plan.prices.same.push(claims.basePriceClaim.current);
	}

	if (claims.unclaimedDesiredBasePrice) {
		plan.prices.new.push(
			withFreshPriceId({
				price: claims.unclaimedDesiredBasePrice,
				isCustom,
			}),
		);
	}

	if (leaveBucket && claims.unclaimedCurrentBasePrice) {
		plan.prices[leaveBucket].push(claims.unclaimedCurrentBasePrice);
	}

	return plan;
};
