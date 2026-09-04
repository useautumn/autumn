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
 * Under full state a feature the org holds but the config never mentions is a
 * removal asked for by omission — the same rule plans follow. Archived
 * features are already off the config's surface, so they are not re-proposed.
 *
 * `features: []` is a removal of everything, and is allowed. It used to be
 * refused as a suspected truncated payload, but that guard predates absent
 * meaning "not mine": a payload that failed to state features now returns above
 * this line, so the only thing left to block was the one case where the caller
 * plainly said it. Refusing it also came out of `preview_update`, which meant
 * you could not preview your way to seeing the deletions.
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
	return ctx.features
		.filter((feature) => !stated.has(feature.id) && !feature.archived)
		.map((feature) => feature.id);
};
