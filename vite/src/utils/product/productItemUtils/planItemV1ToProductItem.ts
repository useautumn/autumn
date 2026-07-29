import {
	type ApiPlanItemV1,
	type CreatePlanItemParamsV1,
	type Feature,
	type ProductItem,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
} from "@autumn/shared";

/**
 * Convert a V1 plan item (API or create-params shape) to the editor's V2
 * ProductItem. Returns null if conversion fails (e.g. a malformed item), so
 * callers can drop it. Shared by the plan-update preview rows and the license
 * customize editor.
 */
export const planItemV1ToProductItem = ({
	item,
	features,
}: {
	item: ApiPlanItemV1 | CreatePlanItemParamsV1;
	features: Feature[];
}): ProductItem | null => {
	const ctx = { features } as unknown as SharedContext;
	try {
		return planItemV0ToProductItem({
			ctx,
			planItem: planItemV1ToV0({ ctx, item }),
		});
	} catch {
		return null;
	}
};
