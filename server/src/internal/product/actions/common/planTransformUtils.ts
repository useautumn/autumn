import {
	apiPlan,
	applyDiff,
	composeMatchKey,
	diffPlanV1,
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	type FullProduct,
	type UpdatePlanParams,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export const fullProductToApiPlanV1 = ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}): Promise<ApiPlanV1> =>
	getPlanResponse({
		ctx,
		product,
		features: ctx.features,
	});

export const getApiPlanDiff = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): DiffedCustomizePlanV1 => diffPlanV1({ from, to });

const dedupeItemsByMatchKey = (
	items: ApiPlanV1["items"],
): ApiPlanV1["items"] => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = composeMatchKey(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const applyDiffToVariantPlan = ({
	plan,
	diff,
}: {
	plan: ApiPlanV1;
	diff: DiffedCustomizePlanV1;
}): ApiPlanV1 => {
	const reconstructed = applyDiff({
		base: plan,
		diff,
	});

	return {
		...plan,
		...reconstructed,
		items: dedupeItemsByMatchKey(reconstructed.items),
	};
};

export const buildProductUpdatesFromApiPlan = ({
	ctx,
	currentFullProduct,
	plan,
}: {
	ctx: AutumnContext;
	currentFullProduct: FullProduct;
	plan: ApiPlanV1;
}): UpdateProductV2Params =>
	apiPlan.map.paramsV1ToProductV2({
		ctx,
		currentFullProduct,
		params: {
			id: currentFullProduct.id,
			items: plan.items,
			price: plan.price,
			free_trial: plan.free_trial,
		} as UpdatePlanParams,
	}) as UpdateProductV2Params;
