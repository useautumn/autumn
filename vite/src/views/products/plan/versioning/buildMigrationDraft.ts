import type { Feature, FrontendProduct, ProductItem } from "@autumn/shared";
import {
	findSimilarItem,
	Infinite,
	isPriceItem,
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
		if (item.included_usage === Infinite) {
			result.unlimited = true;
		} else {
			result.included = Number(item.included_usage);
		}
	}

	if (item.tiers && item.tiers.length > 0) {
		const priceObj: Record<string, unknown> = {
			amount: item.tiers[0].amount ?? 0,
			interval: item.interval ?? "one_off",
		};
		if (item.usage_model) priceObj.billing_method = item.usage_model;
		result.price = priceObj;
	} else if (item.interval) {
		result.reset = { interval: item.interval };
	}

	return result;
}

function getIntervalFilter(item: ProductItem): string | undefined {
	return (item.interval as string) ?? undefined;
}

function buildItemFilter(item: ProductItem): Record<string, unknown> {
	const filter: Record<string, unknown> = { feature_id: item.feature_id };
	const interval = getIntervalFilter(item);
	if (interval) filter.interval = interval;
	return filter;
}

/**
 * Diffs baseProduct vs editedProduct and returns a migration draft
 * with a single `update_plan` operation containing `remove_items`
 * and `add_items` to bring existing customers to the new shape.
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
	const { newItems, removedItems, onlyEntsChanged } = productsAreSame({
		curProductV2: baseProduct,
		newProductV2: editedProduct,
		features,
	});

	const addItems: Record<string, unknown>[] = [];
	const removeItems: Record<string, unknown>[] = [];

	// New or replaced items. If the new item replaces an existing one
	// (same feature+interval+usage_model), emit a remove for the old
	// shape first so the add doesn't conflict.
	for (const item of newItems) {
		if (!item.feature_id) continue;

		const replacedItem = findSimilarItem({ item, items: removedItems });
		if (replacedItem) {
			removeItems.push(buildItemFilter(replacedItem));
		}
		addItems.push(productItemToAddItem(item));
	}

	// Purely removed items (no replacement in the new product).
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

	const customize: Record<string, unknown> = {};
	if (addItems.length > 0) customize.add_items = addItems;
	if (removeItems.length > 0) customize.remove_items = removeItems;
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
			plan: { plan_id: baseProduct.id, version: baseProduct.version },
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
