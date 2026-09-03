import type {
	ApiPlanV1,
	ApiPlanVariantV1,
	Feature,
	FullProduct,
	RevenueCatPlanMapping,
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
	revenuecatMappings,
}: {
	ctx?: AutumnContext;
	basePlan: ApiPlanV1;
	variant: FullProduct;
	features: Feature[];
	expand?: string[];
	currency?: string;
	/** Keyed by plan id — the variant owns its own `revenuecat_mappings` row. */
	revenuecatMappings?: ReadonlyMap<string, RevenueCatPlanMapping>;
}): Promise<ApiPlanVariantV1> => {
	const variantPlan = await getPlanResponse({
		ctx,
		product: variant,
		features,
		expand,
		currency,
		basePlan,
		resolveBaseFullProduct: false,
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
