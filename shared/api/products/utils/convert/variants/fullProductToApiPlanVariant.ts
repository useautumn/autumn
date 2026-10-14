import type { ApiPlanVariantV1 } from "@api/products/apiPlanVariantV1";
import type { FullProduct } from "@models/productModels/productModels";
import type { DiffablePlanV1 } from "@utils/planV1Utils/diff/diffPlanV1";
import type { RevenueCatPlanMapping } from "@utils/productUtils/convertProduct/productToPlanProcessors";
import { fullProductToApiPlan } from "../fullProductToApiPlan";
import type { ApiPlanContext } from "../types/apiPlanContext";

export const fullProductToApiPlanVariant = ({
	ctx,
	basePlan,
	variant,
	currency,
	revenuecatMappings,
}: {
	ctx: ApiPlanContext;
	basePlan: DiffablePlanV1;
	variant: FullProduct;
	currency?: string;
	revenuecatMappings?: ReadonlyMap<string, RevenueCatPlanMapping>;
}): ApiPlanVariantV1 => {
	const variantPlan = fullProductToApiPlan({
		ctx,
		product: variant,
		currency,
		basePlan,
		revenuecatMappings,
	});

	const { variant_details, ...resolvedPlan } = variantPlan;
	const customize = variant_details?.customize;

	return {
		variant_plan_id: variant.id,
		name: variant.name ?? "",
		...(customize ? { customize } : {}),
		plan: resolvedPlan,
	};
};
