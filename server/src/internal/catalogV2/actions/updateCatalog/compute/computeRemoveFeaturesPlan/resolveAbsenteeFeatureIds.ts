import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Every feature id the payload speaks for — stated, removed, or skipped. */
const statedFeatureIds = ({
	params,
}: {
	params: UpdateCatalogParams;
}): Set<string> =>
	new Set([
		...(params.features ?? []).map((entry) => entry.feature_id),
		...params.remove_features.map((entry) => entry.feature_id),
		...params.skip_feature_ids,
	]);

/**
 * Refuses to read an empty payload as "delete every feature", for the same
 * reason the plan side does: a config that failed to load looks identical to
 * one that means it.
 */
const assertNotAWipe = ({
	params,
	absentFeatureIds,
}: {
	params: UpdateCatalogParams;
	absentFeatureIds: string[];
}): void => {
	if ((params.features ?? []).length > 0 || absentFeatureIds.length === 0)
		return;
	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message: `skip_deletions: false with no features would remove all ${absentFeatureIds.length} features. State the features you want, or pass them in skip_feature_ids.`,
		statusCode: 400,
	});
};

/**
 * Under full state a feature the org holds but the config never mentions is a
 * removal asked for by omission — the same rule plans follow. Archived
 * features are already off the config's surface, so they are not re-proposed.
 */
export const resolveAbsenteeFeatureIds = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): string[] => {
	if (params.skip_deletions !== false) return [];
	// A payload that never mentioned features has no opinion about them — the
	// rule the legacy path already follows for rewards and referral programs.
	if (params.features === undefined) return [];

	const stated = statedFeatureIds({ params });
	const absent = ctx.features
		.filter((feature) => !stated.has(feature.id) && !feature.archived)
		.map((feature) => feature.id);

	assertNotAWipe({ params, absentFeatureIds: absent });
	return absent;
};
