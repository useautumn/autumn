import type {
	UpdateCatalogParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	ResolvedPlanParams,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeVersionForPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { versionForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/versionForSlug";

const hasExplicitVersion = (
	planParams: UpdateCatalogPlanParams,
): planParams is ResolvedPlanParams => planParams.version !== undefined;

const groupPlanParamsByPlanId = ({
	planParamsList,
	internalIdRefs,
}: {
	planParamsList: UpdateCatalogParams["plans"];
	internalIdRefs: InternalIdRefs;
}): Map<string, UpdateCatalogPlanParams[]> => {
	const byPlanId = new Map<string, UpdateCatalogPlanParams[]>();
	for (const planParams of planParamsList) {
		// Group under the row's CURRENT id: a rename states the new one.
		const currentPlanId =
			(planParams.internal_id
				? internalIdRefs.get(planParams.internal_id)?.planId
				: undefined) ?? planParams.plan_id;
		const forPlan = byPlanId.get(currentPlanId) ?? [];
		forPlan.push(planParams);
		byPlanId.set(currentPlanId, forPlan);
	}
	return byPlanId;
};

/**
 * The stable id wins: it is the only handle a rename cannot invalidate. A slug
 * or numeric pin naming a different row alongside it is rejected in errors, so
 * by here they either agree or the request never arrives.
 */
const resolvePinnedVersion = ({
	planParams,
	planId,
	productStatesContext,
	internalIdRefs,
}: {
	planParams: UpdateCatalogPlanParams;
	planId: string;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): number | undefined => {
	if (planParams.internal_id !== undefined) {
		return internalIdRefs.get(planParams.internal_id)?.version;
	}
	if (planParams.version !== undefined) return planParams.version;
	if (planParams.version_slug === undefined) return undefined;
	return versionForSlug({
		planId,
		versionSlug: planParams.version_slug,
		productStatesContext,
	});
};

/** Explicit pins first (incl. resolved slugs), then omit→active / new_version max+1.
 * Unknown `version_slug` is excluded here; versioning errors reject it. */
const resolveVersionsForPlan = ({
	planId,
	planParamsList,
	productStatesContext,
	internalIdRefs,
}: {
	planId: string;
	planParamsList: UpdateCatalogPlanParams[];
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): ResolvedPlanParams[] => {
	const resolved = planParamsList.map((planParams) => {
		const version = resolvePinnedVersion({
			planParams,
			planId,
			productStatesContext,
			internalIdRefs,
		});
		return version !== undefined ? { ...planParams, version } : planParams;
	});

	const withExplicitVersion = resolved
		.filter(hasExplicitVersion)
		.sort((a, b) => a.version - b.version);

	const maxVersion = maxVersionForPlan({ planId, productStatesContext });
	const hasLiveVersions =
		(productStatesContext.versionsByPlanId[planId] ?? []).length > 0;
	const nextFreeVersion = maxVersion + 1;
	const activeOrV1 =
		activeVersionForPlan({ planId, productStatesContext }) ?? (maxVersion || 1);

	const targetingLatest = resolved
		.filter(
			(planParams) =>
				!hasExplicitVersion(planParams) &&
				planParams.version_slug === undefined,
		)
		.map((planParams) => ({
			...planParams,
			version:
				planParams.versioning === "new_version" || !hasLiveVersions
					? nextFreeVersion
					: activeOrV1,
		}));

	return [...withExplicitVersion, ...targetingLatest];
};

/**
 * Caller-asked intents: params.plans → ProductUpsertIntent[] with version set
 * and source "direct".
 */
export const deriveDirectIntents = ({
	params,
	productStatesContext,
	internalIdRefs,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): ProductUpsertIntent[] =>
	[
		...groupPlanParamsByPlanId({
			planParamsList: params.plans,
			internalIdRefs,
		}).entries(),
	]
		.flatMap(([planId, planParamsList]) =>
			resolveVersionsForPlan({
				planId,
				planParamsList,
				productStatesContext,
				internalIdRefs,
			}).map((planParams) => ({ planId, planParams })),
		)
		.map(({ planId, planParams }) => ({
			// Key on the row's current id; `plan_id` may be the rename target.
			productKey: { planId, version: planParams.version },
			planParams,
			source: "direct" as const,
			...(planParams.base_variant_id === null ? { unlink: true } : {}),
		}));
