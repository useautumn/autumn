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
	planParamsList: NonNullable<UpdateCatalogParams["plans"]>;
	internalIdRefs: InternalIdRefs;
}): Map<string, UpdateCatalogPlanParams[]> => {
	const byPlanId = new Map<string, UpdateCatalogPlanParams[]>();
	for (const planParams of planParamsList) {
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
		const ref = internalIdRefs.get(planParams.internal_id);
		if (ref !== undefined) return ref.version;
	}
	if (planParams.version !== undefined) return planParams.version;
	if (planParams.version_slug === undefined) return undefined;
	return versionForSlug({
		planId,
		versionSlug: planParams.version_slug,
		productStatesContext,
	});
};

const slugRenameFromInternalId = ({
	planParams,
	planId,
	productStatesContext,
	internalIdRefs,
}: {
	planParams: UpdateCatalogPlanParams;
	planId: string;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
}): Pick<UpdateCatalogPlanParams, "new_version_slug"> => {
	if (planParams.new_version_slug !== undefined) return {};
	if (planParams.internal_id === undefined) return {};
	if (planParams.version_slug === undefined) return {};
	const ref = internalIdRefs.get(planParams.internal_id);
	if (!ref) return {};
	const current = (productStatesContext.versionsByPlanId[planId] ?? []).find(
		(product) => product.version === ref.version,
	);
	if (!current || current.version_slug === planParams.version_slug) return {};
	return { new_version_slug: planParams.version_slug };
};

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
		const slugRename = slugRenameFromInternalId({
			planParams,
			planId,
			productStatesContext,
			internalIdRefs,
		});
		return version !== undefined
			? { ...planParams, ...slugRename, version }
			: planParams;
	});

	const withExplicitVersion = resolved
		.filter(hasExplicitVersion)
		.sort((a, b) => a.version - b.version);

	const maxVersion = maxVersionForPlan({ planId, productStatesContext });
	const hasLiveVersions =
		(productStatesContext.versionsByPlanId[planId] ?? []).length > 0;
	const activeOrV1 =
		activeVersionForPlan({ planId, productStatesContext }) ?? (maxVersion || 1);

	const claimedVersions = new Set(
		withExplicitVersion.map((planParams) => planParams.version),
	);
	let nextFreeVersion = maxVersion + 1;
	const takeFreeVersion = (): number => {
		while (claimedVersions.has(nextFreeVersion)) nextFreeVersion++;
		claimedVersions.add(nextFreeVersion);
		return nextFreeVersion;
	};

	const mintedFromSlug = resolved
		.filter(
			(planParams) =>
				!hasExplicitVersion(planParams) &&
				planParams.version_slug !== undefined,
		)
		.map((planParams) => ({
			...planParams,
			version: takeFreeVersion(),
			new_version_slug: planParams.new_version_slug ?? planParams.version_slug,
			version_slug: undefined,
		}));

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
					? takeFreeVersion()
					: activeOrV1,
		}));

	return [...withExplicitVersion, ...mintedFromSlug, ...targetingLatest];
};

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
			planParamsList: params.plans ?? [],
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
			productKey: { planId, version: planParams.version },
			planParams,
			source: "direct" as const,
			...(planParams.base_variant_id === null ? { unlink: true } : {}),
		}));
