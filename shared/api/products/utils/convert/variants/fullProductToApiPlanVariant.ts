import type { ApiPlanVariantV1 } from "@api/products/apiPlanVariantV1";
import type { FullProduct } from "@models/productModels/productModels";
import type { DiffablePlanV1 } from "@utils/planV1Utils/diff/diffPlanV1";
import type { RevenueCatPlanMapping } from "@utils/productUtils/convertProduct/productToPlanProcessors";
import { fullProductToApiPlan } from "../fullProductToApiPlan";
import type { ApiPlanContext } from "../types/apiPlanContext";

/** A base plan's down-link to a variant: id + name + customize + resolved plan. */
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
	/** Keyed by plan id: the variant owns its own `revenuecat_mappings` row. */
	revenuecatMappings?: ReadonlyMap<string, RevenueCatPlanMapping>;
}): ApiPlanVariantV1 => {
	const variantPlan = fullProductToApiPlan({
		ctx,
		product: variant,
		currency,
		basePlan,
		revenuecatMappings,
	});

	// The edge already carries customize; drop the plan's back-link to the base.
	const { variant_details, ...resolvedPlan } = variantPlan;
	const customize = variant_details?.customize;

	return {
		variant_plan_id: variant.id,
		name: variant.name ?? "",
		...(customize ? { customize } : {}),
		plan: resolvedPlan,
	};
};
