import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { DeclaredVariantsMap } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/shouldUnlinkDirectVariant";
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
	declaredVariants,
}: {
	ctx: AutumnContext;
	intent: ProductUpsertIntent;
	productStatesContext: ProductStatesContext;
	claimedProductKeys: Set<string>;
	declaredVariants?: DeclaredVariantsMap;
}): {
	targetProductPlan: UpsertProductPlan;
	upsertProductPlans: UpsertProductPlan[];
} => {
	const targetProductPlan = intentToUpsertProductPlan({
		ctx,
		intent,
		productStatesContext,
		declaredVariants,
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
