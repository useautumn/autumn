import type { ApiPlanV1 } from "@api/products/apiPlanV1";
import type { FullProduct } from "@models/productModels/productModels";
import {
	type DiffablePlanV1,
	diffPlanV1,
} from "@utils/planV1Utils/diff/diffPlanV1";
import { fullProductToApiPlan } from "../fullProductToApiPlan";
import type { ApiPlanContext } from "../types/apiPlanContext";

/**
 * A variant plan's up-link to its base: base_plan_id + the customize diff, license links included.
 * The base comes pre-rendered or as rows; with neither there is nothing to state.
 */
export const apiPlanToVariantDetails = ({
	ctx,
	plan,
	currency,
	basePlan,
	baseFullProduct,
}: {
	ctx: ApiPlanContext;
	plan: DiffablePlanV1;
	currency?: string;
	basePlan?: DiffablePlanV1;
	baseFullProduct?: FullProduct;
}): ApiPlanV1["variant_details"] => {
	const resolvedBasePlan =
		basePlan ??
		(baseFullProduct
			? fullProductToApiPlan({ ctx, product: baseFullProduct, currency })
			: undefined);
	if (!resolvedBasePlan) return undefined;

	const customize = diffPlanV1({
		from: resolvedBasePlan,
		to: plan,
		includeAdds: true,
		includeRemoves: true,
	});
	const hasCustomize = Object.keys(customize).length > 0;

	return {
		base_plan_id: resolvedBasePlan.id,
		...(hasCustomize ? { customize } : {}),
	};
};
