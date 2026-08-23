import type {
	UpdateCatalogParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
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
}: {
	planParamsList: UpdateCatalogParams["plans"];
}): Map<string, UpdateCatalogPlanParams[]> => {
	const byPlanId = new Map<string, UpdateCatalogPlanParams[]>();
	for (const planParams of planParamsList) {
		const forPlan = byPlanId.get(planParams.plan_id) ?? [];
		forPlan.push(planParams);
		byPlanId.set(planParams.plan_id, forPlan);
	}
	return byPlanId;
};

/** Numeric pin, or the version that owns `version_slug`. Unknown slugs stay unresolved. */
const resolvePinnedVersion = ({
	planParams,
	planId,
	productStatesContext,
}: {
	planParams: UpdateCatalogPlanParams;
	planId: string;
	productStatesContext: ProductStatesContext;
}): number | undefined => {
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
}: {
	planId: string;
	planParamsList: UpdateCatalogPlanParams[];
	productStatesContext: ProductStatesContext;
}): ResolvedPlanParams[] => {
	const resolved = planParamsList.map((planParams) => {
		const version = resolvePinnedVersion({
			planParams,
			planId,
			productStatesContext,
		});
		return version !== undefined ? { ...planParams, version } : planParams;
	});

	const withExplicitVersion = resolved
		.filter(hasExplicitVersion)
		.sort((a, b) => a.version - b.version);

	const maxVersion = maxVersionForPlan({ planId, productStatesContext });
	const activeOrV1 =
		activeVersionForPlan({ planId, productStatesContext }) ??
		(maxVersion || 1);

	const targetingLatest = resolved
		.filter(
			(planParams) =>
				!hasExplicitVersion(planParams) &&
				planParams.version_slug === undefined,
		)
		.map((planParams) => ({
			...planParams,
			version:
				planParams.versioning === "new_version"
					? maxVersion + 1
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
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] =>
	[...groupPlanParamsByPlanId({ planParamsList: params.plans }).entries()]
		.flatMap(([planId, planParamsList]) =>
			resolveVersionsForPlan({
				planId,
				planParamsList,
				productStatesContext,
			}),
		)
		.map((planParams) => ({
			productKey: {
				planId: planParams.plan_id,
				version: planParams.version,
			},
			planParams,
			source: "direct" as const,
			...(planParams.base_variant_id === null ? { unlink: true } : {}),
		}));
