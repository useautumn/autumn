import { handleArchivedPropagationErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleArchivedPropagationErrors";
import { handleDefaultFlagErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleDefaultFlagErrors";
import { handleDirectBaseAndVariantPairErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleDirectBaseAndVariantPairErrors";
import { handleFreeTrialErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleFreeTrialErrors";
import { handleLicenseParentPropagationErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleLicenseParentPropagationErrors";
import { handlePlanLicenseErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handlePlanLicenseErrors";
import { handleRestoreArchivedFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleRestoreArchivedFeatureErrors";
import { handleUsageLimitAlertErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleUsageLimitAlertErrors";
import { handleVariantErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleVariantErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";

const editedSourceInternalIdsByPlan = ({
	upsertProducts,
}: {
	upsertProducts: UpsertProductPlan[];
}): Map<string, Set<string>> => {
	const byPlan = new Map<string, Set<string>>();
	for (const upsert of upsertProducts) {
		if (upsert.row.source !== "direct" && upsert.row.source !== "all_versions")
			continue;
		const ids = byPlan.get(upsert.row.planId) ?? new Set<string>();
		for (const internalId of [
			upsert.row.currentFullProduct?.internal_id,
			upsert.row.baseFullProduct?.internal_id,
			upsert.previousActiveInternalId,
			upsert.row.nextFullProduct.internal_id,
		]) {
			if (internalId) ids.add(internalId);
		}
		byPlan.set(upsert.row.planId, ids);
	}
	return byPlan;
};

export const handleUpsertProductErrors = ({
	updateCatalogPlan,
	productStatesContext,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	const directPlanIds = new Set(
		updateCatalogPlan.upsertProducts
			.filter((upsert) => upsert.row.source === "direct")
			.map((upsert) => upsert.row.planId),
	);
	const editedByPlan = editedSourceInternalIdsByPlan({
		upsertProducts: updateCatalogPlan.upsertProducts,
	});

	handleDirectBaseAndVariantPairErrors({
		directPlanIds,
		upsertProducts: updateCatalogPlan.upsertProducts,
		productStatesContext,
	});

	for (const upsert of updateCatalogPlan.upsertProducts) {
		const { nextFullProduct } = upsert.row;
		const maxVersion = maxVersionForPlan({
			planId: upsert.row.planId,
			productStatesContext,
		});
		const latestExistingVersion = maxVersion === 0 ? undefined : maxVersion;

		handleFreeTrialErrors({ nextFullProduct });
		handleUsageLimitAlertErrors({
			nextFullProduct,
			currentFullProduct: upsert.row.currentFullProduct,
		});

		handleDefaultFlagErrors({
			nextFullProduct,
			currentFullProduct: upsert.row.currentFullProduct,
			latestExistingVersion,
		});

		const editedSourceInternalIds =
			editedByPlan.get(upsert.row.planId) ?? new Set<string>();
		handleVariantErrors({
			upsert,
			productStatesContext,
			directPlanIds,
			editedSourceInternalIds,
		});
		handleArchivedPropagationErrors({ upsert, productStatesContext });
		handleRestoreArchivedFeatureErrors({
			upsert,
			projectedFeatures: updateCatalogPlan.projected.features,
		});
		handleLicenseParentPropagationErrors({
			upsert,
			productStatesContext,
			editedSourceInternalIds,
		});

		handlePlanLicenseErrors({ upsert });
	}
};
