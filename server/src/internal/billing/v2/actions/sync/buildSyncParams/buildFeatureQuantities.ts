import {
	type FeatureQuantityParamsV0,
	isPrepaidPrice,
	priceToEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type {
	ItemDiff,
	MatchedPlan,
} from "@/internal/billing/v2/actions/sync/detect/types";

/**
 * Build feature_quantities for a MatchedPlan by walking the product's
 * prepaid prices.
 *
 * Stripe stores the same Autumn prepaid price under TWO Stripe price ids
 * with different quantity semantics:
 *
 *   - `price.config.stripe_price_id` (V1): Stripe quantity counts EXTRAS
 *     only — allowance is implicit, not billed. We add `allowance` back so
 *     `paramsToFeatureOptions`'s allowance subtraction resolves to extras.
 *
 *   - `price.config.stripe_prepaid_price_v2_id` (V2): Stripe quantity is
 *     TOTAL packs (allowance included). Pass through unchanged.
 *
 * Either way the emitted `quantity` is in feature units, which is what
 * `paramsToFeatureOptions` expects.
 *
 * If a prepaid price is defined in Autumn but absent from Stripe, the
 * helper emits `{ quantity: 0 }` so the synced cusProduct surfaces the
 * feature with zero allowance.
 */
export const buildFeatureQuantities = ({
	matchedPlan,
	itemDiffs,
}: {
	matchedPlan: MatchedPlan;
	itemDiffs: ItemDiff[];
}): FeatureQuantityParamsV0[] => {
	const result: FeatureQuantityParamsV0[] = [];

	for (const price of matchedPlan.product.prices) {
		if (!isPrepaidPrice(price)) continue;

		const entitlement = priceToEnt({
			price,
			entitlements: matchedPlan.product.entitlements,
		});
		if (!entitlement) continue;

		const matchedFeature = matchedPlan.features.find(
			(f) => f.autumn_price_id === price.id,
		);

		if (!matchedFeature) {
			result.push({ feature_id: entitlement.feature.id, quantity: 0 });
			continue;
		}

		const itemDiff = itemDiffs.find(
			(d) => d.stripe.id === matchedFeature.stripe_item_id,
		);
		if (!itemDiff) {
			result.push({ feature_id: entitlement.feature.id, quantity: 0 });
			continue;
		}

		const billingUnits = price.config.billing_units ?? 1;
		const allowance = entitlement.allowance ?? 0;
		const stripePriceIdOnSub = itemDiff.stripe.stripe_price_id;
		const isV2Prepaid =
			"stripe_prepaid_price_v2_id" in price.config &&
			stripePriceIdOnSub === price.config.stripe_prepaid_price_v2_id;

		const stripeQuantityInUnits = new Decimal(itemDiff.stripe.quantity)
			.mul(billingUnits)
			.toNumber();
		const featureUnits = isV2Prepaid
			? stripeQuantityInUnits
			: stripeQuantityInUnits + allowance;

		result.push({
			feature_id: entitlement.feature.id,
			quantity: featureUnits,
			stripe_price_id: stripePriceIdOnSub,
		});
	}

	return result;
};
