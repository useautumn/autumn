import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type {
	ProductStatesContext,
	UpdateCatalogContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "../../utils/productStateUtils/activeFullProductForPlan";
import { findFullProductByInternalId } from "../../utils/productStateUtils/findFullProductByInternalId";
import { versionForSlug } from "../../utils/productStateUtils/versionForSlug";
import type { RemovePlanTarget } from "./resolveRemoveProductTargets";

/** A row addressed by internal_id is spoken for under its CURRENT id too, or
 * renaming it would propose removing the id it is leaving. */
const currentIdOf = ({
	internalId,
	productStatesContext,
}: {
	internalId: string | undefined;
	productStatesContext: ProductStatesContext;
}): string[] => {
	if (internalId === undefined) return [];
	const current = findFullProductByInternalId({
		internalId,
		productStatesContext,
	});
	return current ? [current.id] : [];
};

/** Every plan id the payload speaks for — stated, renamed into, or skipped. */
const statedPlanIds = ({
	params,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): Set<string> =>
	new Set([
		...(params.plans ?? []).flatMap((plan) => [
			plan.plan_id,
			...(plan.new_plan_id ? [plan.new_plan_id] : []),
			...currentIdOf({ internalId: plan.internal_id, productStatesContext }),
			...(plan.variants ?? []).flatMap((variant) => [
				variant.variant_plan_id,
				...(variant.new_plan_id ? [variant.new_plan_id] : []),
				...currentIdOf({
					internalId: variant.internal_id,
					productStatesContext,
				}),
			]),
			...(plan.licenses ?? []).map((license) => license.license_plan_id),
		]),
		...params.remove_plans.map((entry) => entry.plan_id),
		...params.skip_plan_ids,
	]);

/**
 * Under full state, a plan the catalog holds but the payload never mentions is
 * a removal the caller is asking for by omission. Archived rows are already
 * out of the catalog's live surface, so they are not re-proposed.
 *
 * `plans: []` removes everything, and is allowed — see the note on the feature
 * side. The guard that used to refuse it predates absent meaning "not mine",
 * and it fired from `preview_update`, so it blocked seeing the deletions as
 * well as doing them.
 */
export const resolveAbsenteePlanTargets = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}): RemovePlanTarget[] => {
	if (params.skip_deletions !== false) return [];
	// A payload that never mentioned plans has no opinion about them — the rule
	// the legacy path already follows for rewards and referral programs.
	if (params.plans === undefined) return [];

	const stated = statedPlanIds({
		params,
		productStatesContext: catalogContext.productStatesContext,
	});
	const absent = Object.entries(
		catalogContext.productStatesContext.versionsByPlanId,
	).filter(
		([planId, versions]) =>
			!stated.has(planId) && versions.some((product) => !product.archived),
	);

	const wholePlans = absent.flatMap(([planId, versions]) =>
		versions
			.filter((product) => !product.archived)
			.map((product) => ({
				planId,
				version: product.version,
				current: product,
				allVersions: true,
			})),
	);
	if (params.skip_version_deletions !== false) return wholePlans;
	return [
		...wholePlans,
		...absentVersionTargets({ params, catalogContext, stated }),
	];
};

/**
 * Under full state at version level, a stated plan's existing versions the
 * payload does not state are removals too. A row is stated by its internal_id,
 * its explicit version, its slug, or, unpinned, the active version.
 */
const absentVersionTargets = ({
	params,
	catalogContext,
	stated,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
	stated: Set<string>;
}): RemovePlanTarget[] => {
	const { productStatesContext, internalIdRefs } = catalogContext;
	const statedVersions = new Map<string, Set<number>>();
	for (const plan of params.plans ?? []) {
		const ref =
			plan.internal_id === undefined
				? undefined
				: internalIdRefs.get(plan.internal_id);
		const planId = ref?.planId ?? plan.plan_id;
		const version =
			ref?.version ??
			plan.version ??
			(plan.version_slug === undefined
				? activeFullProductForPlan({ planId, productStatesContext })?.version
				: versionForSlug({
						planId,
						versionSlug: plan.version_slug,
						productStatesContext,
					}));
		if (version === undefined) continue;
		const versions = statedVersions.get(planId) ?? new Set<number>();
		versions.add(version);
		statedVersions.set(planId, versions);
	}
	return [...statedVersions.entries()].flatMap(([planId, versions]) => {
		if (!stated.has(planId)) return [];
		const existing = productStatesContext.versionsByPlanId[planId] ?? [];
		return existing
			.filter((product) => !product.archived && !versions.has(product.version))
			.map((product) => ({
				planId,
				version: product.version,
				current: product,
				allVersions: false,
			}));
	});
};
