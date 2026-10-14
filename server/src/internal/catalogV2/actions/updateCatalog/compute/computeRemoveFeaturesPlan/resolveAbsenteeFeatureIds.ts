import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveCurrentFeature } from "../../utils/featureUpdateUtils/resolveCurrentFeature";

const statedFeatureIds = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Set<string> =>
	new Set([
		...(params.features ?? []).flatMap((entry) => {
			const current =
				entry.internal_id === undefined
					? null
					: resolveCurrentFeature({ features: ctx.features, entry });
			return current ? [entry.feature_id, current.id] : [entry.feature_id];
		}),
		...params.remove_features.map((entry) => entry.feature_id),
		...params.skip_feature_ids,
	]);

export const resolveAbsenteeFeatureIds = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): string[] => {
	if (params.skip_deletions !== false) return [];
	if (params.features === undefined) return [];

	const stated = statedFeatureIds({ ctx, params });
	return ctx.features
		.filter((feature) => !stated.has(feature.id) && !feature.archived)
		.map((feature) => feature.id);
};
