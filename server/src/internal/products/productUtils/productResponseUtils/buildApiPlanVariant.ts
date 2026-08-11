import type {
	ApiPlanV1,
	ApiPlanVariantV1,
	Feature,
	FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "./getPlanResponse.js";

/** A base plan's down-link to a variant: id + name + customize + resolved plan. */
export const buildApiPlanVariant = async ({
	ctx,
	basePlan,
	variant,
	features,
	expand,
	currency,
}: {
	ctx?: AutumnContext;
	basePlan: ApiPlanV1;
	variant: FullProduct;
	features: Feature[];
	expand?: string[];
	currency?: string;
}): Promise<ApiPlanVariantV1> => {
	const variantPlan = await getPlanResponse({
		ctx,
		product: variant,
		features,
		expand,
		currency,
		basePlan,
		resolveBaseFullProduct: false,
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
