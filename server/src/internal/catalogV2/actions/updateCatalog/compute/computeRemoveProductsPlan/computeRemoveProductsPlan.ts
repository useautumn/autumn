import type { UpdateCatalogParams } from "@autumn/shared";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { resolveAbsenteePlanTargets } from "./resolveAbsenteePlanTargets";
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
	// Explicit removals, plus — under full state — the plans the payload never
	// mentioned, which is how a config asks for a deletion.
	const targets = [
		...resolveRemoveProductTargets({ params, catalogContext }),
		...resolveAbsenteePlanTargets({ params, catalogContext }),
	];
	const removePlans = stampRemoveWillArchive({
		targets,
		catalogContext,
		projected,
	});

	return { removePlans };
};
