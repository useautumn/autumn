import type { DiffedCustomizePlanV1 } from "@autumn/shared";

/** Drop non-migratable lanes (free trial, metadata) from a plan diff. */
export const toMigratableCustomize = ({
	customize,
}: {
	customize: DiffedCustomizePlanV1;
}): DiffedCustomizePlanV1 => ({
	...(customize.price !== undefined ? { price: customize.price } : {}),
	...(customize.add_items !== undefined
		? { add_items: customize.add_items }
		: {}),
	...(customize.remove_items !== undefined
		? { remove_items: customize.remove_items }
		: {}),
});
