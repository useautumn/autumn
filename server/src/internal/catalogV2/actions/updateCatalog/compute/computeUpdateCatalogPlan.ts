import {
	enrichCtxWithFeatures,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInsertFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeInsertFeaturesPlan/computeInsertFeaturesPlan";
import { computeMigrationDraftPlans } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/computeMigrationDraftPlans";
import { computeRemoveFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveFeaturesPlan/computeRemoveFeaturesPlan";
import { computeRemoveProductsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveProductsPlan/computeRemoveProductsPlan";
import { computeRenameProductIdsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRenameProductIdsPlan/computeRenameProductIdsPlan";
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
 * Plan removes run after upserts so willArchive sees the post-upsert catalog.
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

	const updateFeaturesStep = computeUpdateFeaturesPlan({
		ctx,
		catalogContext,
		params,
	});
	compute.advance({ step: updateFeaturesStep });

	compute.advance({
		step: computeInsertFeaturesPlan({
			ctx,
			params,
			projected: compute.projected,
		}),
	});

	const removeFeaturesStep = computeRemoveFeaturesPlan({
		ctx,
		catalogContext,
		params,
		projected: compute.projected,
	});
	compute.advance({ step: removeFeaturesStep });

	// Plan items resolve against post-feature-ops features (same-call creates/renames).
	// A feature this call removes stays projected when it archives, so existing
	// rows still render; a stated item may not name that row. One the call also
	// updates stays resolvable, so the errors phase reports that contradiction.
	const updatedInternalFeatureIds = new Set(
		(updateFeaturesStep.updateFeatures ?? []).map(
			(plan) => plan.current.internal_id,
		),
	);
	const removedInternalFeatureIds = new Set(
		(removeFeaturesStep.removeFeatures ?? []).flatMap((plan) =>
			plan.current && !updatedInternalFeatureIds.has(plan.current.internal_id)
				? [plan.current.internal_id]
				: [],
		),
	);
	compute.advance({
		step: computeUpsertProductsPlan({
			ctx: enrichCtxWithFeatures({
				ctx,
				features: compute.projected.features.filter(
					(feature) => !removedInternalFeatureIds.has(feature.internal_id),
				),
			}),
			catalogContext,
			params,
		}),
	});

	compute.advance({
		step: computeRemoveProductsPlan({
			catalogContext,
			params,
			projected: compute.projected,
		}),
	});

	const plan = compute.toPlan();
	return {
		...plan,
		renamePlans: computeRenameProductIdsPlan({
			params,
			productStatesContext: catalogContext.productStatesContext,
			internalIdRefs: catalogContext.internalIdRefs,
			aliases: ctx.org.planAliases,
		}),
		migrationDrafts: computeMigrationDraftPlans({
			upsertProductPlans: plan.upsertProducts,
			params,
			productStatesContext: catalogContext.productStatesContext,
			removePlans: plan.removePlans,
		}),
	};
};
