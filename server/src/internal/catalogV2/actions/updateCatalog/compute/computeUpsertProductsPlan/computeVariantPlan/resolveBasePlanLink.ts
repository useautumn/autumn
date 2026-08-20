import type { FullProduct } from "@autumn/shared";
import { shouldUnlinkDirectVariant } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/shouldUnlinkDirectVariant";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { ProductUpsertIntent } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const latestInternalProductId = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): string | undefined =>
	productStatesContext.versionsByPlanId[planId]?.[0]?.internal_id;

/** Inherited sibling write, then declared `base_plan_id`, then a variants[] omission.
 * An unknown base_plan_id yields undefined — handleUpsertProductBasePlanErrors rejects it. */
export const resolveBasePlanLink = ({
	intent,
	currentFullProduct,
	productStatesContext,
	declaredVariantPlanIdsByBasePlanId,
}: {
	intent: ProductUpsertIntent;
	currentFullProduct: FullProduct | null;
	productStatesContext: ProductStatesContext;
	declaredVariantPlanIdsByBasePlanId?: Map<string, Set<string>>;
}): string | null | undefined => {
	if (intent.basePlanLink !== undefined) return intent.basePlanLink;

	const { source, planParams } = intent;
	const declaredBasePlanId = planParams.base_plan_id;
	if (source === "direct" && declaredBasePlanId !== undefined) {
		if (declaredBasePlanId === null) return null;
		return latestInternalProductId({
			planId: declaredBasePlanId,
			productStatesContext,
		});
	}

	return shouldUnlinkDirectVariant({
		source,
		planId: intent.productKey.planId,
		currentFullProduct,
		productStatesContext,
		declaredVariantPlanIdsByBasePlanId,
	})
		? null
		: undefined;
};
