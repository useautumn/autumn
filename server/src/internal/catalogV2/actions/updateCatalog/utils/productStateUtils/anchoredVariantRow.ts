import type { CatalogVariantParams, FullProduct } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "./activeFullProductForPlan";
import { findFullProductByInternalId } from "./findFullProductByInternalId";
import { fullProductForPlanParams } from "./fullProductForPlanParams";

export const anchoredVariantRow = ({
	planId,
	anchorInternalIds,
	productStatesContext,
	includeArchived = false,
}: {
	planId: string;
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
	includeArchived?: boolean;
}): FullProduct | null => {
	const anchoredRows = (
		productStatesContext.versionsByPlanId[planId] ?? []
	).filter(
		(product) =>
			(includeArchived || !product.archived) &&
			product.base_internal_product_id != null &&
			anchorInternalIds.has(product.base_internal_product_id),
	);
	if (anchoredRows.length === 0) return null;

	return (
		anchoredRows.find((product) => product.active) ??
		anchoredRows.reduce((latest, product) =>
			product.version > latest.version ? product : latest,
		)
	);
};

const planIsStandalone = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): boolean => {
	const rows = productStatesContext.versionsByPlanId[planId] ?? [];
	return (
		rows.length > 0 && rows.every((row) => row.base_internal_product_id == null)
	);
};

export const variantRowForDeclaredEntry = ({
	variant,
	anchorInternalIds,
	productStatesContext,
}: {
	variant: Pick<
		CatalogVariantParams,
		"variant_plan_id" | "version" | "version_slug"
	> & { internal_id?: string };
	anchorInternalIds: Set<string>;
	productStatesContext: ProductStatesContext;
}): FullProduct | null => {
	const planId = variant.variant_plan_id;
	if (variant.internal_id !== undefined) {
		const identified = findFullProductByInternalId({
			internalId: variant.internal_id,
			productStatesContext,
		});
		if (identified) return identified;
	}
	if (variant.version !== undefined || variant.version_slug !== undefined) {
		return fullProductForPlanParams({
			planParams: {
				plan_id: planId,
				version: variant.version,
				version_slug: variant.version_slug,
			},
			productStatesContext,
		});
	}
	const anchored = anchoredVariantRow({
		planId,
		anchorInternalIds,
		productStatesContext,
		includeArchived: true,
	});
	if (anchored) return anchored;
	if (planIsStandalone({ planId, productStatesContext })) {
		return activeFullProductForPlan({ planId, productStatesContext });
	}
	return null;
};
