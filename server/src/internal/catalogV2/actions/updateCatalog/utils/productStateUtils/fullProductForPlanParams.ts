import type { FullProduct, UpdateCatalogPlanParams } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "./activeFullProductForPlan";
import { fullProductForSlug } from "./fullProductForSlug";

/** Existing row this plan entry addresses. Mint-without-pin → null. */
export const fullProductForPlanParams = ({
	planParams,
	productStatesContext,
}: {
	planParams: Pick<
		UpdateCatalogPlanParams,
		"plan_id" | "version" | "version_slug" | "versioning"
	>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	const { plan_id: planId, version, version_slug: versionSlug } = planParams;
	if (version !== undefined) {
		return (
			(productStatesContext.versionsByPlanId[planId] ?? []).find(
				(product) => product.version === version,
			) ?? null
		);
	}
	if (versionSlug !== undefined) {
		return fullProductForSlug({
			planId,
			versionSlug,
			productStatesContext,
		});
	}
	if (planParams.versioning === "new_version") return null;
	return activeFullProductForPlan({ planId, productStatesContext });
};
