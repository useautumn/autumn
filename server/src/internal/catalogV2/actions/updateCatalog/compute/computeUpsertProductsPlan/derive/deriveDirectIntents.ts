import type {
	UpdateCatalogParams,
	UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	ResolvedPlanParams,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const hasExplicitVersion = (
	planParams: UpdateCatalogPlanParams,
): planParams is ResolvedPlanParams => planParams.version !== undefined;

const latestVersionForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): number => productStatesContext.versionsByPlanId[planId]?.[0]?.version ?? 0;

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

/** Explicit versions ascending, then omit→latest (or v1 if plan absent). */
const resolveVersionsForPlan = ({
	planId,
	planParamsList,
	productStatesContext,
}: {
	planId: string;
	planParamsList: UpdateCatalogPlanParams[];
	productStatesContext: ProductStatesContext;
}): ResolvedPlanParams[] => {
	const withExplicitVersion = planParamsList
		.filter(hasExplicitVersion)
		.sort((a, b) => a.version - b.version);

	const latestOrV1 =
		latestVersionForPlan({ planId, productStatesContext }) || 1;

	const targetingLatest = planParamsList
		.filter((planParams) => !hasExplicitVersion(planParams))
		.map((planParams) => ({ ...planParams, version: latestOrV1 }));

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
		}));
