import type { ClaimResult } from "../types/claimResult";
import type { EntitlementPricesPlanMode } from "../types/computeEntitlementPricesPlanParams";
import {
	type EntitlementPricesPlan,
	emptyEntitlementPricesPlan,
} from "../types/entitlementPricesPlan";
import {
	leaveBucketForMode,
	pushEntitlementPrice,
	withFreshIds,
	withFreshPriceId,
} from "./buildEntitlementPricesPlanUtils";

/**
 * A claim matches on price definition, which deliberately ignores Stripe ids —
 * billing depends on that. So a re-stated mapping arrives as a claimed pair and
 * would be dropped; carry it onto the row we keep instead.
 */
const adoptedPriceIdOf = (
	entitlementPrice: ClaimResult["entitlementPriceClaims"][number]["current"],
): string | undefined =>
	(
		entitlementPrice.price?.config as
			| { stripe_prepaid_price_v2_id?: string }
			| undefined
	)?.stripe_prepaid_price_v2_id;

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

	for (const { desired, current } of claims.entitlementPriceClaims) {
		const statedPriceId = adoptedPriceIdOf(desired);
		const mappingChanged =
			statedPriceId !== undefined &&
			statedPriceId !== adoptedPriceIdOf(current) &&
			current.price !== undefined;

		if (!mappingChanged) {
			pushEntitlementPrice({ plan, bucket: "same", entitlementPrice: current });
			continue;
		}

		const keptPrice = current.price!;
		pushEntitlementPrice({
			plan,
			bucket: "updated",
			entitlementPrice: {
				...current,
				price: {
					...keptPrice,
					config: {
						...keptPrice.config,
						stripe_prepaid_price_v2_id: statedPriceId,
					} as typeof keptPrice.config,
				},
			},
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
