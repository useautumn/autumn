import type { ProductItem } from "@autumn/shared";
import { useCallback, useRef } from "react";
import { isFeaturePriceItem, isPriceItem } from "@/utils/product/getItemType";
import type { UseAttachForm } from "./useAttachForm";

const hasIncludedUsage = (item: ProductItem) => {
	return (
		item.included_usage !== null &&
		item.included_usage !== undefined &&
		item.included_usage !== 0
	);
};

/**
 * Strips all pricing from items:
 * - Removes base-price-only items entirely
 * - Removes feature+price items that have no included_usage (purely priced)
 * - Keeps feature+price items with included_usage, clearing all pricing/billing fields
 */
export function stripPricesFromItems({
	items,
}: {
	items: ProductItem[];
}): ProductItem[] {
	return items
		.filter((item) => {
			if (isPriceItem(item)) return false;
			if (isFeaturePriceItem(item) && !hasIncludedUsage(item)) return false;
			return true;
		})
		.map((item) => {
			if (!isFeaturePriceItem(item)) return item;
			return {
				...item,
				price: null,
				tiers: null,
				usage_model: null,
				price_config: null,
			};
		});
}

/**
 * Manages the "Grant for Free" toggle by stashing/restoring the raw form items
 * so the form's `items` field remains the single source of truth.
 */
export function useGrantFree({
	form,
	resolveCurrentItems,
}: {
	form: UseAttachForm;
	resolveCurrentItems: () => ProductItem[];
}) {
	const stashedItemsRef = useRef<ProductItem[] | null>(null);

	const handleGrantFreeToggle = useCallback(
		({ enabled }: { enabled: boolean }) => {
			if (enabled) {
				const rawFormItems = form.store.state.values.items;
				stashedItemsRef.current = rawFormItems;

				const itemsToStrip = resolveCurrentItems();
				form.setFieldValue(
					"items",
					stripPricesFromItems({ items: itemsToStrip }),
				);
				form.setFieldValue("grantFree", true);
			} else {
				form.setFieldValue("items", stashedItemsRef.current);
				form.setFieldValue("grantFree", false);
				stashedItemsRef.current = null;
			}
		},
		[form, resolveCurrentItems],
	);

	const resetGrantFree = useCallback(() => {
		stashedItemsRef.current = null;
	}, []);

	return { handleGrantFreeToggle, resetGrantFree };
}
