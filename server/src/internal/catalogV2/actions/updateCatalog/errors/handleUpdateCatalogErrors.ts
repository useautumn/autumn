import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRemoveFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemoveFeatureErrors/handleRemoveFeatureErrors";
import { handleRemovePlanErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemovePlanErrors/handleRemovePlanErrors";
import { handleUpdateFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/handleUpdateFeatureErrors";
import { handleUpsertProductErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleUpsertProductErrors";
import { handleUpsertProductRenameErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductRenameErrors";
import { handleUpsertProductVersioningErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersioningErrors";
import { handleUpsertProductVersionSlugErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersionSlugErrors";
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
	handleUpsertProductVersioningErrors({
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
	handleUpsertProductErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
};
