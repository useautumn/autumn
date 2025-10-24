import { AppEnv, type Feature, FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

export const handleCopyFeatures = async ({
	ctx,
	sandboxFeatures,
	liveFeatures,
}: {
	ctx: AutumnContext;
	sandboxFeatures: Feature[];
	liveFeatures: Feature[];
}) => {
	const newContext = {
		...ctx,
		features: liveFeatures,
		env: AppEnv.Live,
	};

	// Separate features by type: Boolean/Metered must be created before CreditSystem
	// since credit systems can reference metered features in their credit_schema
	const booleanAndMeteredFeatures = sandboxFeatures.filter(
		(f) => f.type === FeatureType.Boolean || f.type === FeatureType.Metered,
	);
	const creditSystemFeatures = sandboxFeatures.filter(
		(f) => f.type === FeatureType.CreditSystem,
	);

	// First, process boolean and metered features
	const firstBatchPromises = [];
	for (const sandboxFeature of booleanAndMeteredFeatures) {
		const liveFeature = liveFeatures.find((f) => f.id === sandboxFeature.id);

		if (liveFeature) {
			firstBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: sandboxFeature.id,
					updates: sandboxFeature,
				}),
			);
		} else {
			firstBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: sandboxFeature,
				}),
			);
		}
	}
	await Promise.all(firstBatchPromises);

	// Then, process credit system features
	const secondBatchPromises = [];
	for (const sandboxFeature of creditSystemFeatures) {
		const liveFeature = liveFeatures.find((f) => f.id === sandboxFeature.id);

		if (liveFeature) {
			secondBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: sandboxFeature.id,
					updates: sandboxFeature,
				}),
			);
		} else {
			secondBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: sandboxFeature,
				}),
			);
		}
	}
	await Promise.all(secondBatchPromises);
};
