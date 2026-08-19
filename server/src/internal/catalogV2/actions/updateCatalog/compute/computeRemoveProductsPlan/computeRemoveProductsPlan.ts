import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { mergeRemoveRepointUpserts } from "./mergeRemoveRepointUpserts";
import { resolveRemoveProductTargets } from "./resolveRemoveProductTargets";
import { stampRemoveWillArchive } from "./stampRemoveWillArchive";

/**
 * Remove intents with willArchive stamped against the post-upsert projection.
 * Variants pointing at a deleted/archived base are re-pointed in the same
 * upsertProducts slice (source: "repoint") when a live sibling remains.
 */
export const computeRemoveProductsPlan = ({
	ctx,
	catalogContext,
	params,
	projected,
	existingUpserts,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
	projected: ProjectedCatalog;
	existingUpserts: UpsertProductPlan[];
}): CatalogComputeStep => {
	const targets = resolveRemoveProductTargets({ params, catalogContext });
	const removePlans = stampRemoveWillArchive({
		targets,
		catalogContext,
		projected,
	});
	const upsertProducts = mergeRemoveRepointUpserts({
		ctx,
		catalogContext,
		removePlans,
		projected,
		existingUpserts,
	});

	return {
		removePlans,
		...(upsertProducts !== existingUpserts ? { upsertProducts } : {}),
	};
};
