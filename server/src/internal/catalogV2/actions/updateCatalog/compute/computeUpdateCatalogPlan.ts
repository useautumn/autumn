import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInsertFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeInsertFeaturesPlan/computeInsertFeaturesPlan";
import { computeRemoveFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveFeaturesPlan/computeRemoveFeaturesPlan";
import { computeUpdateFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateFeaturesPlan/computeUpdateFeaturesPlan";
import { computeUpsertProductsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductsPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { createCatalogComputeState } from "@/internal/catalogV2/actions/updateCatalog/utils/catalogComputeStateUtils/catalogComputeStateUtils";

/**
 * Fold ordered compute steps onto one UpdateCatalogPlan.
 *
 * Feature order: update → insert → remove. Updates land in the projection
 * before CS inserts validate schema refs; removes stamp willArchive against
 * the post-upsert projection (minus co-removed rows).
 *
 * Products follow features so plan items can reference same-call features.
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
	const originalProducts = Object.values(
		catalogContext.productStatesContext.versionsByPlanId,
	).flat();

	const compute = createCatalogComputeState({
		originalFeatures: ctx.features,
		originalProducts,
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

	compute.advance({
		step: computeUpsertProductsPlan({
			ctx,
			catalogContext,
			params,
		}),
	});

	return compute.toPlan();
};
