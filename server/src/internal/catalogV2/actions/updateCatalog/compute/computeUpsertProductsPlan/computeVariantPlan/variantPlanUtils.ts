import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** True when this upsert minted a new version row (clone source is baseFullProduct). */
export const baseRowMinted = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean =>
	upsert.row.versioning === "new_version" &&
	upsert.row.baseFullProduct != null;

/** Latest variant of this base (MAX(version) per plan id). */
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
		].filter((internalId): internalId is string => internalId !== undefined),
	);

	const latest: FullProduct[] = [];
	for (const versions of Object.values(
		productStatesContext.versionsByPlanId,
	)) {
		const product = versions[0];
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
