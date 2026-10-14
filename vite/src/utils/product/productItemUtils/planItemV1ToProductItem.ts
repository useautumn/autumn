import {
	type ApiPlanItemV1,
	type CreatePlanItemParamsV1,
	type Feature,
	type ProductItem,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
} from "@autumn/shared";

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
