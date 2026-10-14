import type { UpdateCatalogParams } from "@autumn/shared";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { resolveAbsenteePlanTargets } from "./resolveAbsenteePlanTargets";
import { resolveRemoveProductTargets } from "./resolveRemoveProductTargets";
import { stampRemoveWillArchive } from "./stampRemoveWillArchive";

export const computeRemoveProductsPlan = ({
	catalogContext,
	params,
	projected,
}: {
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
	projected: ProjectedCatalog;
}): CatalogComputeStep => {
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
