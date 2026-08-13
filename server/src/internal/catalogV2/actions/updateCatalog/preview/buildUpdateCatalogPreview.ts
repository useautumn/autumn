import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import { buildFeaturesPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/features/buildFeaturesPreview";
import { buildPlansPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/buildPlansPreview";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Pure map: update catalog plan → preview response body. */
export const buildUpdateCatalogPreview = ({
	catalogContext,
	updateCatalogPlan,
}: {
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): PreviewUpdateCatalogResponse => ({
	plans: buildPlansPreview({
		updateCatalogPlan,
		productStatesContext: catalogContext.productStatesContext,
	}),
	features: buildFeaturesPreview({ catalogContext, updateCatalogPlan }),
	migrations: updateCatalogPlan.migrationDrafts.map(
		({ id: _id, ...preview }) => preview,
	),
});
