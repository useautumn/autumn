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

		// Defaulting non-V1 ids to the "extras" branch folded Stripe's default
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
