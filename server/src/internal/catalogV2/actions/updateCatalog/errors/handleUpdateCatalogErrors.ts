import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRemoveFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemoveFeatureErrors/handleRemoveFeatureErrors";
import { handleUpdateFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/handleUpdateFeatureErrors";
import { handleUpsertProductErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductErrors/handleUpsertProductErrors";
import { handleUpsertProductRenameErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductRenameErrors";
import { handleUpsertProductVersioningErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductVersioningErrors";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Throws on anything that should fail the whole batch before any write. */
export const handleUpdateCatalogErrors = ({
	ctx,
	catalogContext,
	updateCatalogPlan,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
	params: UpdateCatalogParams;
}): void => {
	handleUpdateFeatureErrors({ ctx, catalogContext, updateCatalogPlan });
	handleRemoveFeatureErrors({ updateCatalogPlan });
	handleUpsertProductVersioningErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	handleUpsertProductRenameErrors({
		params,
		productStatesContext: catalogContext.productStatesContext,
		updateCatalogPlan,
	});
	handleUpsertProductErrors({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	});
};
