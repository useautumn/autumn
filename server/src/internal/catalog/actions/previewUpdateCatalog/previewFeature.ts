import {
	ApiVersion,
	ApiVersionClass,
	type CatalogFeaturePreview,
	dbToApiFeatureV1,
	type Feature,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	detectFeatureUpdateBlockers,
	isBlockableFeatureChange,
} from "@/internal/features/utils/updateFeatureUtils/detectFeatureUpdateBlockers.js";
import { getObjectsUsingFeature } from "@/internal/features/utils/updateFeatureUtils/getObjectsUsingFeature.js";

const FEATURE_TARGET_VERSION = new ApiVersionClass(ApiVersion.V2_1);

/**
 * Resolve a single proposed feature change without persisting: the resulting
 * feature plus any conditions that would block `updateFeature` from applying it.
 */
export const previewFeature = async ({
	ctx,
	dbFeature,
	existing,
	products,
}: {
	ctx: AutumnContext;
	dbFeature: Feature;
	existing: Feature | null;
	products: FullProduct[];
}): Promise<CatalogFeaturePreview> => {
	const feature = dbToApiFeatureV1({
		ctx,
		dbFeature,
		targetVersion: FEATURE_TARGET_VERSION,
	});

	const blockers =
		existing &&
		isBlockableFeatureChange({ feature: existing, updates: dbFeature })
			? detectFeatureUpdateBlockers({
					feature: existing,
					updates: dbFeature,
					objectsUsingFeature: await getObjectsUsingFeature({
						ctx,
						feature: existing,
						products,
					}),
					allFeatures: ctx.features,
				})
			: [];

	return { feature, blockers };
};
