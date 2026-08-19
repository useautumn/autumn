import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleRemoveFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleRemoveFeatureErrors/handleRemoveFeatureErrors";
import { handleUpdateFeatureErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/handleUpdateFeatureErrors";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Throws on anything that should fail the whole batch before any write. */
export const handleUpdateCatalogErrors = ({
	ctx,
	catalogContext,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	handleUpdateFeatureErrors({ ctx, catalogContext, updateCatalogPlan });
	handleRemoveFeatureErrors({ updateCatalogPlan });
};
