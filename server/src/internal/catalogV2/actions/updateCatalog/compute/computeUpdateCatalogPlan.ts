import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInsertFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeInsertFeaturesPlan/computeInsertFeaturesPlan";
import { computeRemoveFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveFeaturesPlan/computeRemoveFeaturesPlan";
import { computeUpdateFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateFeaturesPlan/computeUpdateFeaturesPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { createCatalogComputeState } from "@/internal/catalogV2/actions/updateCatalog/utils/catalogComputeStateUtils/catalogComputeStateUtils";

/**
 * Fold ordered compute steps onto one UpdateCatalogPlan.
 *
 * Feature order: update → insert → remove. Updates land in the projection
 * before CS inserts validate schema refs; removes stamp willArchive against
 * the post-upsert projection (minus co-removed rows).
 */
export const computeUpdateCatalogPlan = ({
	ctx,
	catalogContext,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
}): UpdateCatalogPlan => {
	const compute = createCatalogComputeState({
		originalFeatures: ctx.features,
	});

	compute.advance({
		step: computeUpdateFeaturesPlan({ ctx, catalogContext, params }),
	});

	compute.advance({
		step: computeInsertFeaturesPlan({
			ctx,
			params,
			projected: compute.projected,
		}),
	});

	compute.advance({
		step: computeRemoveFeaturesPlan({
			ctx,
			catalogContext,
			params,
			projected: compute.projected,
		}),
	});

	return compute.toPlan();
};
