import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** The representing row for this plan_id (`active === true`), or null. */
export const activeFullProductForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	(productStatesContext.versionsByPlanId[planId] ?? []).find(
		(product) => product.active,
	) ?? null;
