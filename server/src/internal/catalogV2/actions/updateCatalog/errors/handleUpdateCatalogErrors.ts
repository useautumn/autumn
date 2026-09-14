import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assertInternalIdAgrees } from "@/internal/catalogV2/actions/updateCatalog/errors/assertInternalIdAgrees";
import { handleActivePointerErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleActivePointerErrors";
import { handleDeclaredVariantAnchorErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleDeclaredVariantAnchorErrors";
import { handleLicenseAnchorLifecycleErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleLicenseAnchorLifecycleErrors";
import { handleRemoveFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemoveFeatureErrors/handleRemoveFeatureErrors";
import { handleRemovePlanErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemovePlanErrors/handleRemovePlanErrors";
import { handleRewardErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRewardErrors";
import { handleUpdateFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/handleUpdateFeatureErrors";
import { handleUpsertProductActiveErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductActiveErrors";
import { handleUpsertProductErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleUpsertProductErrors";
import { handleUpsertProductRenameErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductRenameErrors";
import { handleUpsertProductVersioningErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersioningErrors";
import { handleUpsertProductVersionSlugErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersionSlugErrors";
import { handleVariantSharedAcrossVersionsErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleVariantSharedAcrossVersionsErrors";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Throws on anything that should fail the whole batch before any write. */
export const handleUpdateCatalogErrors = async ({
	ctx,
	catalogContext,
	updateCatalogPlan,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
	params: UpdateCatalogParams;
}): Promise<void> => {
	handleUpdateFeatureErrors({ ctx, catalogContext, updateCatalogPlan });
	handleRemoveFeatureErrors({ updateCatalogPlan });
	handleRemovePlanErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
	assertInternalIdAgrees({
		params,
		productStatesContext: catalogContext.productStatesContext,
		internalIdRefs: catalogContext.internalIdRefs,
	});
	handleUpsertProductVersioningErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	handleDeclaredVariantAnchorErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	handleVariantSharedAcrossVersionsErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	await handleUpsertProductRenameErrors({
		ctx,
		params,
		productStatesContext: catalogContext.productStatesContext,
		updateCatalogPlan,
	});
	handleUpsertProductVersionSlugErrors({ updateCatalogPlan });
	handleUpsertProductActiveErrors({ params });
	handleActivePointerErrors({ updateCatalogPlan });
	handleUpsertProductErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
	handleLicenseAnchorLifecycleErrors({ updateCatalogPlan });
	await handleRewardErrors({ ctx, params, catalogContext, updateCatalogPlan });
};
