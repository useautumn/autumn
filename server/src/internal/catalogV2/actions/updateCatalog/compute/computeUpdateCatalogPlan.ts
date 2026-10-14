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
import {
	computeRemoveReferralProgramsPlan,
	computeUpsertReferralProgramsPlan,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeRewardsPlan/computeReferralProgramsPlan";
import {
	computeRemoveRewardsPlan,
	computeUpsertRewardsPlan,
} from "@/internal/catalogV2/actions/updateCatalog/compute/computeRewardsPlan/computeRewardsPlan";
import { computeUpdateFeaturesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateFeaturesPlan/computeUpdateFeaturesPlan";
import { computeUpsertProductsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductsPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { createCatalogComputeState } from "@/internal/catalogV2/actions/updateCatalog/utils/catalogComputeStateUtils/catalogComputeStateUtils";

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
	const { rewardStatesContext } = catalogContext;
	return {
		...plan,
		upsertRewards: computeUpsertRewardsPlan({ params, rewardStatesContext }),
		removeRewards: computeRemoveRewardsPlan({ params, rewardStatesContext }),
		upsertReferralPrograms: computeUpsertReferralProgramsPlan({
			params,
			rewardStatesContext,
		}),
		removeReferralPrograms: computeRemoveReferralProgramsPlan({
			params,
			rewardStatesContext,
		}),
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
