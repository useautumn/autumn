import type { Feature, FrontendProduct, ProductItem } from "@autumn/shared";
import { isPriceItem, productsAreSame } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

export interface MigrationDraft {
	id: string;
	filter: MigrationFilter;
	operations: Operations;
	no_billing_changes: boolean;
}

export interface DiffSummaryEntry {
	action: "added" | "removed" | "changed";
	label: string;
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

function formatPriceLabel(item: ProductItem | undefined): string {
	if (!item) return "free";
	const amount =
		(item as Record<string, unknown>).price ?? item.tiers?.[0]?.amount ?? 0;
	return `$${amount}/${item.interval ?? "one-off"}`;
}

export function buildDiffSummary({
	baseProduct,
	editedProduct,
	features,
}: {
	baseProduct: FrontendProduct;
	editedProduct: FrontendProduct;
	features: Feature[];
}): DiffSummaryEntry[] {
	const { newItems, removedItems } = productsAreSame({
		curProductV2: baseProduct,
		newProductV2: editedProduct,
		features,
	});

	const entries: DiffSummaryEntry[] = [];

	const removedFeatureIds = new Set(
		removedItems.filter((i) => i.feature_id).map((i) => i.feature_id),
	);
	const newFeatureIds = new Set(
		newItems.filter((i) => i.feature_id).map((i) => i.feature_id),
	);

	for (const item of removedItems) {
		if (!item.feature_id) continue;
		if (newFeatureIds.has(item.feature_id)) {
			entries.push({ action: "changed", label: item.feature_id });
		} else {
			entries.push({ action: "removed", label: item.feature_id });
		}
	}

	for (const item of newItems) {
		if (!item.feature_id) continue;
		if (removedFeatureIds.has(item.feature_id)) continue;
		entries.push({ action: "added", label: item.feature_id });
	}

	const oldBase = baseProduct.items?.find((i) => isPriceItem(i));
	const newBase = editedProduct.items?.find((i) => isPriceItem(i));
	if (JSON.stringify(oldBase) !== JSON.stringify(newBase)) {
		entries.push({
			action: "changed",
			label: `Base price: ${formatPriceLabel(oldBase)} → ${formatPriceLabel(newBase)}`,
		});
	}

	return entries;
}

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

	const removedFeatureIds = new Set(
		removedItems.filter((i) => i.feature_id).map((i) => i.feature_id),
	);

	for (const item of newItems) {
		if (!item.feature_id) continue;
		if (removedFeatureIds.has(item.feature_id)) {
			const oldItem = removedItems.find(
				(r) => r.feature_id === item.feature_id,
			)!;
			removeItems.push({ feature_id: oldItem.feature_id });
		}
		addItems.push(productItemToAddItem(item));
	}

	for (const item of removedItems) {
		if (!item.feature_id) continue;
		if (newItems.some((n) => n.feature_id === item.feature_id)) continue;
		removeItems.push({ feature_id: item.feature_id });
	}

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
			plan: { plan_id: baseProduct.id },
		},
	};

	const timestamp = Math.floor(Date.now() / 1000);

	return {
		id: `${baseProduct.id}-update-${timestamp}`,
		filter,
		// The operations shape is validated server-side by Zod; we build it
		// as a plain object here to avoid fighting the discriminated union types.
		operations: { customer: [updatePlanOp] } as unknown as Operations,
		no_billing_changes: onlyEntsChanged,
	};
}
