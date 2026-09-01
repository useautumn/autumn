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
		...params.plans.flatMap((plan) => [
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
 * Refuses to read an empty payload as "delete everything".
 *
 * A config that failed to load, or a first run pointed at the wrong
 * environment, both arrive as zero plans. Wiping a live catalog is not a
 * recoverable mistake, so this is the one place full state declines to act on
 * what it was literally told.
 */
const assertNotAWipe = ({
	params,
	absentPlanIds,
}: {
	params: UpdateCatalogParams;
	absentPlanIds: string[];
}): void => {
	if (params.plans.length > 0 || absentPlanIds.length === 0) return;
	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message: `skip_deletions: false with no plans would remove all ${absentPlanIds.length} plans in the catalog. State the plans you want, or pass them in skip_plan_ids.`,
		statusCode: 400,
	});
};

/**
 * Under full state, a plan the catalog holds but the payload never mentions is
 * a removal the caller is asking for by omission. Archived rows are already
 * out of the catalog's live surface, so they are not re-proposed.
 */
export const resolveAbsenteePlanTargets = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}): RemovePlanTarget[] => {
	if (params.skip_deletions !== false) return [];

	const stated = statedPlanIds({ params });
	const absent = Object.entries(
		catalogContext.productStatesContext.versionsByPlanId,
	).filter(
		([planId, versions]) =>
			!stated.has(planId) && versions.some((product) => !product.archived),
	);

	assertNotAWipe({ params, absentPlanIds: absent.map(([planId]) => planId) });

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
