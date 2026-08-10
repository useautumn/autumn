import {
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { detectFeatureUpdateBlockers } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpdateFeatureErrors/detectFeatureUpdateBlockers";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import { featureChangeFlags } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/featureChangeFlags";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { throwFeatureUpdateBlocker } from "@/internal/features/featureActions/updateFeature.js";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import { validateFeature } from "@/internal/features/utils/validateFeature.js";

/**
 * Ids a rename may not take: every id in the projected catalog and every
 * persisted id, minus the feature's own rows. Persisted ids stay taken even
 * when this batch renames them away, so execute never depends on op order —
 * swaps and chains throw instead.
 */
const takenFeatureIdsForRename = ({
	ctx,
	updateCatalogPlan,
	updateFeaturePlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
	updateFeaturePlan: UpdateFeaturePlan;
}): Set<string> =>
	new Set(
		[...updateCatalogPlan.projected.features, ...ctx.features]
			.filter(
				(feature) =>
					feature.internal_id !== updateFeaturePlan.current.internal_id,
			)
			.map((feature) => feature.id),
	);

const assertNoPropagateOverflow = ({
	updateFeaturePlan,
	catalogContext,
}: {
	updateFeaturePlan: UpdateFeaturePlan;
	catalogContext: UpdateCatalogContext;
}) => {
	const { current, next } = updateFeaturePlan;
	const flags = featureChangeFlags({ current, next });
	const needsEntitlements =
		flags.isChangingId || flags.isChangingType || flags.isChangingUsageType;
	if (!needsEntitlements) return;

	const state = catalogContext.featureStatesContext[current.id];
	if (!state) return;

	if (state.entitlementsOverflow) {
		throw new RecaseError({
			message: `Cannot update feature ${current.id}: too many entitlements reference it (max ${FEATURE_REWRITE_ROW_LIMIT}). Narrow the change or update those rows first.`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}
	if (flags.isChangingId && state.entityFeatureIdEntitlementsOverflow) {
		throw new RecaseError({
			message: `Cannot update feature ${current.id}: too many entity-scoped entitlements reference it (max ${FEATURE_REWRITE_ROW_LIMIT}).`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}
	if (
		(flags.isChangingId || flags.isChangingUsageType) &&
		state.pricesOverflow
	) {
		throw new RecaseError({
			message: `Cannot update feature ${current.id}: too many prices reference it (max ${FEATURE_REWRITE_ROW_LIMIT}).`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}
};

/**
 * CS refs that block this feature: present before the batch AND still present
 * after. Inserted CS rows and schema members newly added by this call must not
 * block the metered update that makes those schemas valid.
 */
const blockingCreditSystemFeatureIds = ({
	ctx,
	updateCatalogPlan,
	updateFeaturePlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
	updateFeaturePlan: UpdateFeaturePlan;
}): string[] => {
	const insertedFeatureIds = new Set(
		updateCatalogPlan.insertFeatures.map((feature) => feature.id),
	);
	const projectedFeatures = updateCatalogPlan.projected.features.filter(
		(feature) => !insertedFeatureIds.has(feature.id),
	);

	const originalIds = new Set(
		getCreditSystemsFromFeature({
			featureId: updateFeaturePlan.current.id,
			features: ctx.features,
		}).map((creditSystem) => creditSystem.id),
	);

	// Schemas may still use current.id, or next.id after a same-call CS update.
	const projectedIds = new Set(
		[updateFeaturePlan.current.id, updateFeaturePlan.next.id].flatMap(
			(featureId) =>
				getCreditSystemsFromFeature({
					featureId,
					features: projectedFeatures,
				}).map((creditSystem) => creditSystem.id),
		),
	);

	return [...projectedIds].filter((id) => originalIds.has(id));
};

/** Throws the first blocker with the exact error the live update path throws. */
export const handleUpdateFeatureErrors = ({
	ctx,
	catalogContext,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	for (const feature of updateCatalogPlan.insertFeatures) {
		validateFeature({
			data: feature,
			allFeatures: updateCatalogPlan.projected.features,
		});
	}

	for (const updateFeaturePlan of updateCatalogPlan.updateFeatures) {
		validateFeature({
			data: updateFeaturePlan.next,
			allFeatures: updateCatalogPlan.projected.features,
		});
		assertNoPropagateOverflow({ updateFeaturePlan, catalogContext });

		const [blocker] = detectFeatureUpdateBlockers({
			updateFeaturePlan,
			takenFeatureIds: takenFeatureIdsForRename({
				ctx,
				updateCatalogPlan,
				updateFeaturePlan,
			}),
			featureState:
				catalogContext.featureStatesContext[updateFeaturePlan.current.id],
			projectedCreditSystemFeatureIds: blockingCreditSystemFeatureIds({
				ctx,
				updateCatalogPlan,
				updateFeaturePlan,
			}),
		});
		if (blocker) {
			throwFeatureUpdateBlocker({ blocker, newId: updateFeaturePlan.next.id });
		}
	}
};
