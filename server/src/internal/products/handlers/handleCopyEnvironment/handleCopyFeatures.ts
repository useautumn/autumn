import { type AppEnv, type Feature, FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

export const handleCopyFeatures = async ({
	ctx,
	sourceFeatures,
	targetFeatures,
	toEnv,
}: {
	ctx: AutumnContext;
	sourceFeatures: Feature[];
	targetFeatures: Feature[];
	toEnv: AppEnv;
}) => {
	const newContext = {
		...ctx,
		features: targetFeatures,
		env: toEnv,
	};

	const booleanAndMeteredFeatures = sourceFeatures.filter(
		(f) => f.type === FeatureType.Boolean || f.type === FeatureType.Metered,
	);
	const creditSystemFeatures = sourceFeatures.filter(
		(f) => f.type === FeatureType.CreditSystem,
	);

	const firstBatchPromises = [];
	for (const sourceFeature of booleanAndMeteredFeatures) {
		const targetFeature = targetFeatures.find((f) => f.id === sourceFeature.id);

		if (targetFeature) {
			firstBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: sourceFeature.id,
					updates: sourceFeature,
				}),
			);
		} else {
			firstBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: sourceFeature,
				}),
			);
		}
	}
	await Promise.all(firstBatchPromises);

	const secondBatchPromises = [];
	for (const sourceFeature of creditSystemFeatures) {
		const targetFeature = targetFeatures.find((f) => f.id === sourceFeature.id);

		if (targetFeature) {
			secondBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: sourceFeature.id,
					updates: sourceFeature,
				}),
			);
		} else {
			secondBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: sourceFeature,
				}),
			);
		}
	}
	await Promise.all(secondBatchPromises);
};
