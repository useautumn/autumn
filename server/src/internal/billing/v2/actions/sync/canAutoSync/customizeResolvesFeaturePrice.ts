import {
	matchesPlanItemFilter,
	priceToEnt,
	type SyncPlanInstance,
	toProductItem,
} from "@autumn/shared";
import type { ItemDiff } from "../detect/types";

type CustomItem = NonNullable<
	NonNullable<SyncPlanInstance["customize"]>["add_items"]
>[number];
type RemoveItemFilter = NonNullable<
	NonNullable<SyncPlanInstance["customize"]>["remove_items"]
>[number];

const hasExactlyOneStripeBoundReplacement = ({
	items,
	featureId,
	stripePriceId,
}: {
	items: CustomItem[];
	featureId: string;
	stripePriceId: string;
}): boolean => {
	let replacement: CustomItem | null = null;
	for (const item of items) {
		if (item.feature_id !== featureId) continue;
		if (replacement) return false;
		replacement = item;
	}
	return replacement?.price?.stripe_price_id === stripePriceId;
};

const filterRemovesMatchedPrice = ({
	filter,
	diff,
}: {
	filter: RemoveItemFilter;
	diff: ItemDiff;
}): boolean => {
	if (diff.match.kind !== "autumn_price") return false;
	const { price, product } = diff.match;
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});
	if (!entitlement) return false;
	return matchesPlanItemFilter({
		item: toProductItem({ ent: entitlement, price }),
		filter,
	});
};

const removesMatchedPrice = ({
	filters,
	diff,
}: {
	filters: RemoveItemFilter[];
	diff: ItemDiff;
}): boolean => {
	for (const filter of filters) {
		if (filterRemovesMatchedPrice({ filter, diff })) return true;
	}
	return false;
};

export const customizeResolvesFeaturePrice = ({
	syncPlan,
	diff,
}: {
	syncPlan: SyncPlanInstance | null;
	diff: ItemDiff;
}): boolean => {
	const customize = syncPlan?.customize;
	if (!customize || diff.match.kind !== "autumn_price") return false;

	const featureId = diff.match.price.config.feature_id;
	if (!featureId) return false;
	const stripePriceId = diff.stripe.stripe_price_id;

	// PUT-style customization must contain one Stripe-bound item for the feature.
	if (customize.items) {
		return hasExactlyOneStripeBoundReplacement({
			items: customize.items,
			featureId,
			stripePriceId,
		});
	}

	// PATCH-style customization must first remove the matched catalog item.
	if (!removesMatchedPrice({ filters: customize.remove_items ?? [], diff })) {
		return false;
	}

	// The patch must add exactly one replacement bound to the Stripe price.
	return hasExactlyOneStripeBoundReplacement({
		items: customize.add_items ?? [],
		featureId,
		stripePriceId,
	});
};
