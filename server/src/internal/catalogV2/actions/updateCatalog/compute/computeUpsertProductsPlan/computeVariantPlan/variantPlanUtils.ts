import type { FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export const baseRowMinted = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean =>
	upsert.row.versioning === "new_version" &&
	upsert.row.baseFullProduct != null;

export const variantRowsAnchoredTo = ({
	baseInternalIds,
	productStatesContext,
	includeArchived = false,
}: {
	baseInternalIds: Iterable<string>;
	productStatesContext: ProductStatesContext;
	includeArchived?: boolean;
}): FullProduct[] => {
	const ids = new Set(
		[...baseInternalIds].filter((internalId) => internalId.length > 0),
	);
	if (ids.size === 0) return [];

	const rows: FullProduct[] = [];
	for (const versions of Object.values(productStatesContext.versionsByPlanId)) {
		for (const product of versions) {
			if (!product.base_internal_product_id) continue;
			if (!ids.has(product.base_internal_product_id)) continue;
			if (!includeArchived && product.archived) continue;
			rows.push(product);
		}
	}
	return rows;
};

export const reachInternalIdsForBaseUpsert = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): string[] => {
	if (baseRowMinted({ upsert }) && upsert.row.baseFullProduct) {
		return [upsert.row.baseFullProduct.internal_id];
	}

	const ids = [
		upsert.row.currentFullProduct?.internal_id,
		upsert.row.nextFullProduct.internal_id,
	];
	if (
		upsert.previousActiveInternalId &&
		(upsert.propagate?.variants?.length ?? 0) > 0
	) {
		ids.push(upsert.previousActiveInternalId);
	}

	return [
		...new Set(
			ids.filter((internalId): internalId is string => internalId != null),
		),
	];
};
