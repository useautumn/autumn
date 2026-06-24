import {
	type FeatureQuantityParamsV0,
	isPrepaidPrice,
	notNullish,
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

		// Stripe quantity counts EXTRAS only for the explicit V1 prepaid price id,
		// where the allowance is implicit/unbilled and must be added back. For the
		// V2 id — or any imported / Stripe-native price id on the sub — the
		// quantity is the TOTAL (allowance-inclusive), so it passes through.
		// Defaulting non-V1 ids to the "extras" branch folded Stripe's default
		// `quantity: 1` into a phantom +1 credit on top of the allowance.
		const isV1ExtrasOnly =
			notNullish(price.config.stripe_price_id) &&
			stripePriceIdOnSub === price.config.stripe_price_id;

		const stripeQuantityInUnits = new Decimal(itemDiff.stripe.quantity)
			.mul(billingUnits)
			.toNumber();
		const featureUnits = isV1ExtrasOnly
			? stripeQuantityInUnits + allowance
			: stripeQuantityInUnits;

		result.push({
			feature_id: entitlement.feature.id,
			quantity: featureUnits,
			stripe_price_id: stripePriceIdOnSub,
		});
	}

	return result;
};
