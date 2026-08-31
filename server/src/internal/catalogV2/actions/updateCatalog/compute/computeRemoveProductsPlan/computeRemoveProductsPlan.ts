import type { UpdateCatalogParams } from "@autumn/shared";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { resolveRemoveProductTargets } from "./resolveRemoveProductTargets";
import { stampRemoveWillArchive } from "./stampRemoveWillArchive";

/**
 * Remove intents with willArchive stamped against the post-upsert projection.
 * Variants still pointing at a removed/archived base fail in the error phase.
 */
export const computeRemoveProductsPlan = ({
	catalogContext,
	params,
	projected,
}: {
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
	projected: ProjectedCatalog;
}): CatalogComputeStep => {
	const targets = resolveRemoveProductTargets({ params, catalogContext });
	const removePlans = stampRemoveWillArchive({
		targets,
		catalogContext,
		projected,
	});

	return { removePlans };
};
