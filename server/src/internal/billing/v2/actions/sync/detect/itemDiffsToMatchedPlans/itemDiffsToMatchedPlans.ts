import {
	BillingMethod,
	type CreatePlanItemParamsV1,
	type CustomizePlanV1,
	type FullProduct,
	isUsagePrice,
	productToBasePrice,
	type SharedContext,
} from "@autumn/shared";
import {
	isFeaturePriceMatch,
	matchesOnStripePriceId,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { ItemDiff, MatchedPlan, PlanExtra, PlanFeature } from "../types";
import { decidePlanBase } from "./decidePlanBase";
import { derivePlanQuantity } from "./derivePlanQuantity";
import { rollupPlanLicenses } from "./rollupPlanLicenses";
import { stripeItemToCustomFeaturePrice } from "./stripeItemToCustomFeaturePrice";
import { derivePlanWarnings, groupItemDiffsByPlan } from "./utils/rollupUtils";

/**
 * Turn flat per-item diffs into per-plan verdicts:
 * ① group — which plan owns each Stripe item
 * ② derive — base, quantity, features, licenses, extras, warnings.
 */
export const itemDiffsToMatchedPlans = ({
	ctx,
	itemDiffs,
}: {
	ctx: SharedContext;
	itemDiffs: ItemDiff[];
}): MatchedPlan[] => {
	const itemDiffsByPlan = groupItemDiffsByPlan({ itemDiffs });

	const matchedPlans: MatchedPlan[] = [];
	for (const { product, diffs } of itemDiffsByPlan) {
		matchedPlans.push(diffsToMatchedPlan({ ctx, product, diffs }));
	}
	return matchedPlans;
};

/** A usage feature price whose Stripe amount may differ from the catalog:
 * matched via product id (not price id), so the amount isn't guaranteed equal.
 * Rebuilds it as a custom item carrying the Stripe amount. */
const diffToCustomUsageItem = ({
	ctx,
	diff,
	baseStripeItemId,
}: {
	ctx: SharedContext;
	diff: ItemDiff;
	baseStripeItemId: string | undefined;
}): CreatePlanItemParamsV1 | null => {
	if (!isFeaturePriceMatch(diff.match)) return null;
	if (diff.stripe.id === baseStripeItemId) return null;
	if (matchesOnStripePriceId(diff.match)) return null;
	if (!isUsagePrice({ price: diff.match.price })) return null;

	return stripeItemToCustomFeaturePrice({
		ctx,
		item: diff.stripe,
		matchedPrice: diff.match.price,
		product: diff.match.product,
	});
};

/** Fold the custom base (customize.price) and custom usage prices
 * (add_items, replacing their catalog counterparts) into one patch. */
const buildCustomize = ({
	baseCustomize,
	customUsageItems,
}: {
	baseCustomize: CustomizePlanV1 | undefined;
	customUsageItems: CreatePlanItemParamsV1[];
}): CustomizePlanV1 | undefined => {
	if (customUsageItems.length === 0) return baseCustomize;
	return {
		...baseCustomize,
		add_items: customUsageItems,
		remove_items: customUsageItems.map((item) => ({
			feature_id: item.feature_id,
			billing_method: BillingMethod.UsageBased,
		})),
	};
};

const diffsToMatchedPlan = ({
	ctx,
	product,
	diffs,
}: {
	ctx: SharedContext;
	product: FullProduct;
	diffs: ItemDiff[];
}): MatchedPlan => {
	const basePrice = productToBasePrice({ product });

	const baseDecision = decidePlanBase({ diffs, basePrice });
	const baseStripeItemId = baseDecision.baseStripeItem?.id;

	const features: PlanFeature[] = diffs.flatMap((diff) =>
		isFeaturePriceMatch(diff.match) && diff.stripe.id !== baseStripeItemId
			? [
					{
						stripe_item_id: diff.stripe.id,
						autumn_price_id: diff.match.price.id,
					},
				]
			: [],
	);
	const customUsageItems = diffs.flatMap((diff) => {
		const item = diffToCustomUsageItem({ ctx, diff, baseStripeItemId });
		return item ? [item] : [];
	});
	const extras: PlanExtra[] = baseDecision.extraDiffs.map((diff) => ({
		stripe_item_id: diff.stripe.id,
	}));
	const { licenses, warnings: licenseWarnings } = rollupPlanLicenses({
		diffs,
	});
	const quantity = derivePlanQuantity({
		baseStripeItem: baseDecision.baseStripeItem,
		diffs,
	});

	return {
		product,
		quantity,
		base: baseDecision.base,
		features,
		extras,
		customize: buildCustomize({
			baseCustomize: baseDecision.customize,
			customUsageItems,
		}),
		warnings: [
			...derivePlanWarnings({
				baseDecision,
				extras,
				quantity,
				isAddOn: product.is_add_on === true,
			}),
			...licenseWarnings,
		],
		...(licenses.length > 0 ? { licenses } : {}),
	};
};
