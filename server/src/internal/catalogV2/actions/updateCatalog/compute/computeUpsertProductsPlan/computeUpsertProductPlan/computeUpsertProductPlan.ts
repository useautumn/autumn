import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeDemotedProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/computeDemotedProductPlan";
import { intentToUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/intentToUpsertProductPlan";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** One intent → the target plan plus the demoted plan when this row takes `active`. */
export const computeUpsertProductPlan = ({
	ctx,
	intent,
	productStatesContext,
	claimedProductKeys,
	declaredVariantPlanIdsByBasePlanId,
}: {
	ctx: AutumnContext;
	intent: ProductUpsertIntent;
	productStatesContext: ProductStatesContext;
	claimedProductKeys: Set<string>;
	declaredVariantPlanIdsByBasePlanId?: Map<string, Set<string>>;
}): {
	targetProductPlan: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
} => {
	const targetProductPlan = intentToUpsertProductPlan({
		ctx,
		intent,
		productStatesContext,
		declaredVariantPlanIdsByBasePlanId,
	});
	const demotedProductPlan = computeDemotedProductPlan({
		ctx,
		targetProductPlan,
		productStatesContext,
		claimedProductKeys,
	});
	return {
		targetProductPlan,
		upsertProductPlans: demotedProductPlan
			? [demotedProductPlan, targetProductPlan]
			: [targetProductPlan],
	};
};
