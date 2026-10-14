import type { Feature, UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveAbsenteeFeatureIds } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveFeaturesPlan/resolveAbsenteeFeatureIds";
import { resolveCurrentFeature } from "./resolveCurrentFeature";

export const paramsToTouchedFeatures = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Feature[] => {
	const touchedFeatureIds = new Set([
		...(params.features ?? []).flatMap((entry) => {
			const current = resolveCurrentFeature({ features: ctx.features, entry });
			return current ? [entry.feature_id, current.id] : [entry.feature_id];
		}),
		...params.remove_features.map((entry) => entry.feature_id),
		...resolveAbsenteeFeatureIds({ ctx, params }),
	]);
	return ctx.features.filter((feature) => touchedFeatureIds.has(feature.id));
};
