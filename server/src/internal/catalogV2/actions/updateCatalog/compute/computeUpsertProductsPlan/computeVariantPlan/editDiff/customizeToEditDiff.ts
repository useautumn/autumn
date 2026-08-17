import type {
	CatalogVariantParams,
	DiffedCustomizePlanV1,
} from "@autumn/shared";

/** variants[].customize → the in-memory editDiff applyDiff understands. */
export const customizeToEditDiff = ({
	customize,
}: {
	customize: NonNullable<CatalogVariantParams["customize"]>;
}): DiffedCustomizePlanV1 => ({
	...(customize.price !== undefined ? { price: customize.price } : {}),
	...(customize.add_items !== undefined
		? { add_items: customize.add_items }
		: {}),
	...(customize.remove_items !== undefined
		? { remove_items: customize.remove_items }
		: {}),
	...(customize.free_trial !== undefined
		? { free_trial: customize.free_trial }
		: {}),
	...(customize.upsert_licenses !== undefined
		? { upsert_licenses: customize.upsert_licenses }
		: {}),
});
