import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { ProductUpsertIntent } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";

const namesBaseCreatedInRequest = ({
	intent,
	statedPlanIds,
	productStatesContext,
}: {
	intent: ProductUpsertIntent;
	statedPlanIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const baseVariantId = intent.planParams.base_variant_id;
	if (typeof baseVariantId !== "string") return false;
	if (!statedPlanIds.has(baseVariantId)) return false;
	return !activeFullProductForPlan({
		planId: baseVariantId,
		productStatesContext,
	});
};

/** `base_variant_id` resolves against the fold, so a base this request creates must fold first. */
export const orderCreatedBasesFirst = ({
	intents,
	productStatesContext,
}: {
	intents: ProductUpsertIntent[];
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	const statedPlanIds = new Set(
		intents.map((intent) => intent.productKey.planId),
	);
	const linksForward = (intent: ProductUpsertIntent) =>
		namesBaseCreatedInRequest({ intent, statedPlanIds, productStatesContext });

	return [
		...intents.filter((intent) => !linksForward(intent)),
		...intents.filter(linksForward),
	];
};
