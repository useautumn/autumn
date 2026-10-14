import { type Feature, FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

export const handleCopyFeatures = async ({
	toContext,
	fromFeatures,
}: {
	toContext: AutumnContext;
	fromFeatures: Feature[];
}) => {
	const { features: toFeatures } = toContext;

	const booleanAndMeteredFeatures = fromFeatures.filter(
		(f) => f.type === FeatureType.Boolean || f.type === FeatureType.Metered,
	);
	const creditSystemFeatures = fromFeatures.filter(
		(f) =>
			f.type === FeatureType.CreditSystem ||
			f.type === FeatureType.AiCreditSystem,
	);

	const firstBatchPromises = [];
	for (const fromFeature of booleanAndMeteredFeatures) {
		const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

		if (toFeature) {
			firstBatchPromises.push(
				updateFeature({
					ctx: toContext,
					featureId: fromFeature.id,
					updates: fromFeature,
				}),
			);
		} else {
			firstBatchPromises.push(
				createFeature({
					ctx: toContext,
					data: fromFeature,
				}),
			);
		}
	}
	await Promise.all(firstBatchPromises);

	const secondBatchPromises = [];
	for (const fromFeature of creditSystemFeatures) {
		const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

		if (toFeature) {
			secondBatchPromises.push(
				updateFeature({
					ctx: toContext,
					featureId: fromFeature.id,
					updates: fromFeature,
				}),
			);
		} else {
			secondBatchPromises.push(
				createFeature({
					ctx: toContext,
					data: fromFeature,
				}),
			);
		}
	}
	await Promise.all(secondBatchPromises);
};
