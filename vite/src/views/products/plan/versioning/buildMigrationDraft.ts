import type { Feature, FrontendProduct, ProductItem } from "@autumn/shared";
import {
	findSimilarItem,
	isPriceItem,
	itemsAreSame,
	productsAreSame,
} from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

export interface MigrationDraft {
	id: string;
	filter: MigrationFilter;
	operations: Operations;
	no_billing_changes: boolean;
}

function productItemToAddItem(item: ProductItem): Record<string, unknown> {
	const result: Record<string, unknown> = { feature_id: item.feature_id };

	if (item.included_usage != null) {
		result.included = item.included_usage;
	}

	if (item.tiers && item.tiers.length > 0) {
		const priceObj: Record<string, unknown> = {
			amount: item.tiers[0].amount ?? 0,
		};
		if (item.interval) priceObj.interval = item.interval;
		if (item.usage_model) priceObj.billing_method = item.usage_model;
		result.price = priceObj;
	}

	return result;
}

function getIntervalFilter(item: ProductItem): string | undefined {
	return (item.interval as string) ?? undefined;
}

// True when the only thing that changed is included_usage (e.g. 100 -> 200 free units).
// These can use an update_items op instead of a remove+add.
function isIncludedOnlyChange(oldItem: ProductItem, newItem: ProductItem): boolean {
	if (oldItem.included_usage === newItem.included_usage) return false;

	const { same } = itemsAreSame({
		item1: { ...oldItem, included_usage: newItem.included_usage },
		item2: newItem,
	});
	return same;
}

function buildItemFilter(item: ProductItem): Record<string, unknown> {
	const filter: Record<string, unknown> = { feature_id: item.feature_id };
	const interval = getIntervalFilter(item);
	if (interval) filter.interval = interval;
	return filter;
}

/**
 * Diffs baseProduct vs editedProduct and returns a migration draft that,
 * when executed, will bring existing customers from the old plan shape
 * to the new one.
 *
 * The draft contains a single `update_plan` operation whose `customize`
 * block may include three kinds of item changes:
 *
 *   update_items — items where only included_usage changed
 *   remove_items — items that were deleted or replaced
 *   add_items    — items that are new or replace a removed item
 *
 * It also detects base-price changes (the plan's flat recurring charge).
 */
export function buildMigrationDraft({
	baseProduct,
	editedProduct,
	features,
}: {
	baseProduct: FrontendProduct;
	editedProduct: FrontendProduct;
	features: Feature[];
}): MigrationDraft {
	// productsAreSame gives us the raw diff: which items are new in the
	// edited product and which were removed from the base product.
	// `onlyEntsChanged` is true when no pricing fields changed (meaning
	// the migration won't trigger Stripe subscription modifications).
	const { newItems, removedItems, onlyEntsChanged } = productsAreSame({
		curProductV2: baseProduct,
		newProductV2: editedProduct,
		features,
	});

	const addItems: Record<string, unknown>[] = [];
	const removeItems: Record<string, unknown>[] = [];
	const updateItems: Record<string, unknown>[] = [];
	const baseItems = baseProduct.items ?? [];

	// Pass 1: find items that only need an included_usage update.
	// These are items that exist in both old and new, where the only
	// diff is the free-tier allowance. We emit an update_items entry
	// rather than a remove+add so existing usage state is preserved.
	const updatedItems = new Set<ProductItem>();
	for (const newItem of newItems) {
		if (!newItem.feature_id) continue;
		const oldItem = findSimilarItem({ item: newItem, items: baseItems });
		if (oldItem && isIncludedOnlyChange(oldItem, newItem)) {
			updatedItems.add(newItem);
			updateItems.push({
				filter: buildItemFilter(newItem),
				included: newItem.included_usage,
			});
		}
	}

	// Pass 2: everything else that's new. If the new item replaces an
	// existing one (same feature+interval+usage_model), emit a remove
	// for the old shape first so the add doesn't conflict.
	for (const item of newItems) {
		if (!item.feature_id) continue;
		if (updatedItems.has(item)) continue;

		const replacedItem = findSimilarItem({ item, items: removedItems });
		if (replacedItem) {
			removeItems.push(buildItemFilter(replacedItem));
		}
		addItems.push(productItemToAddItem(item));
	}

	// Pass 3: purely removed items (no replacement in the new product).
	for (const item of removedItems) {
		if (!item.feature_id) continue;
		if (findSimilarItem({ item, items: newItems })) continue;
		removeItems.push(buildItemFilter(item));
	}

	// Base price change (the plan's flat recurring/one-off charge).
	const oldBase = baseProduct.items?.find((i) => isPriceItem(i));
	const newBase = editedProduct.items?.find((i) => isPriceItem(i));
	const basePriceChanged =
		JSON.stringify(oldBase) !== JSON.stringify(newBase);

	// Assemble the customize block — only include sections that have entries.
	const customize: Record<string, unknown> = {};
	if (addItems.length > 0) customize.add_items = addItems;
	if (removeItems.length > 0) customize.remove_items = removeItems;
	if (updateItems.length > 0) customize.update_items = updateItems;
	if (basePriceChanged && newBase) {
		customize.price = {
			amount:
				(newBase as Record<string, unknown>).price ??
				newBase.tiers?.[0]?.amount ??
				0,
			interval: newBase.interval ?? "month",
		};
	}

	const hasCustomize = Object.keys(customize).length > 0;

	const updatePlanOp = {
		type: "update_plan" as const,
		plan_filter: { plan_id: baseProduct.id },
		...(hasCustomize ? { customize } : {}),
	};

	const filter: MigrationFilter = {
		customer: {
			plan: { plan_id: baseProduct.id },
		},
	};

	const timestamp = Math.floor(Date.now() / 1000);

	return {
		id: `${baseProduct.id}-update-${timestamp}`,
		filter,
		operations: { customer: [updatePlanOp] } as unknown as Operations,
		no_billing_changes: onlyEntsChanged,
	};
}
