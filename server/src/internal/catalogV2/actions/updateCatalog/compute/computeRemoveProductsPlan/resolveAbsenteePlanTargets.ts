import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanTarget } from "./resolveRemoveProductTargets";

/** Every plan id the payload speaks for — stated, renamed into, or skipped. */
const statedPlanIds = ({
	params,
}: {
	params: UpdateCatalogParams;
}): Set<string> =>
	new Set([
		...(params.plans ?? []).flatMap((plan) => [
			plan.plan_id,
			...(plan.new_plan_id ? [plan.new_plan_id] : []),
			...(plan.variants ?? []).flatMap((variant) => [
				variant.variant_plan_id,
				...(variant.new_plan_id ? [variant.new_plan_id] : []),
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

	const stated = statedPlanIds({ params });
	const absent = Object.entries(
		catalogContext.productStatesContext.versionsByPlanId,
	).filter(
		([planId, versions]) =>
			!stated.has(planId) && versions.some((product) => !product.archived),
	);

	return absent.flatMap(([planId, versions]) =>
		versions
			.filter((product) => !product.archived)
			.map((product) => ({
				planId,
				version: product.version,
				current: product,
				allVersions: true,
			})),
	);
};
