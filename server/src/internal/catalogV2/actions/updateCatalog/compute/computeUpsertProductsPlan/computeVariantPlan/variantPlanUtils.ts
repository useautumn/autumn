import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";

/** True when this upsert minted a new version row (clone source is baseFullProduct). */
export const baseRowMinted = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean =>
	upsert.row.versioning === "new_version" &&
	upsert.row.baseFullProduct != null;

/** Active variant of this base (the representing row per child plan id). */
export const latestVariantsOfBase = ({
	upsert,
	productStatesContext,
	includeArchived = false,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	includeArchived?: boolean;
}): FullProduct[] => {
	const baseInternalIds = new Set(
		[
			upsert.row.currentFullProduct?.internal_id,
			upsert.row.baseFullProduct?.internal_id,
			upsert.row.nextFullProduct.internal_id,
			upsert.previousActiveInternalId,
		].filter((internalId): internalId is string => internalId !== undefined),
	);

	const latest: FullProduct[] = [];
	for (const planId of Object.keys(productStatesContext.versionsByPlanId)) {
		const product = activeFullProductForPlan({
			planId,
			productStatesContext,
		});
		if (!product || (!includeArchived && product.archived)) continue;
		if (product.id === upsert.row.planId) continue;
		if (
			!product.base_internal_product_id ||
			!baseInternalIds.has(product.base_internal_product_id)
		) {
			continue;
		}
		latest.push(product);
	}
	return latest;
};
