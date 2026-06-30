import {
	type AppEnv,
	type Feature,
	FeatureType,
	type Organization,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";

/**
 * Copies features from one (org, env) into another (org, env).
 *
 * Generalised from the original sandbox→live copy: the source and target may
 * live in different organizations (e.g. two sandbox sub-orgs of the same master
 * org), so the write context is rebuilt around an explicit `toOrg`/`toEnv`
 * rather than reusing `ctx.org`.
 */
export const handleCopyFeatures = async ({
	ctx,
	fromFeatures,
	toOrg,
	toEnv,
	toFeatures,
}: {
	ctx: AutumnContext;
	fromFeatures: Feature[];
	toOrg: Organization;
	toEnv: AppEnv;
	toFeatures: Feature[];
}) => {
	const newContext = {
		...ctx,
		org: toOrg,
		features: toFeatures,
		env: toEnv,
	};

	// Separate features by type: Boolean/Metered must be created before CreditSystem
	// since credit systems can reference metered features in their credit_schema
	const booleanAndMeteredFeatures = fromFeatures.filter(
		(f) => f.type === FeatureType.Boolean || f.type === FeatureType.Metered,
	);
	const creditSystemFeatures = fromFeatures.filter(
		(f) => f.type === FeatureType.CreditSystem,
	);

	// First, process boolean and metered features
	const firstBatchPromises = [];
	for (const fromFeature of booleanAndMeteredFeatures) {
		const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

		if (toFeature) {
			firstBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: fromFeature.id,
					updates: fromFeature,
				}),
			);
		} else {
			firstBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: fromFeature,
				}),
			);
		}
	}
	await Promise.all(firstBatchPromises);

	// Then, process credit system features
	const secondBatchPromises = [];
	for (const fromFeature of creditSystemFeatures) {
		const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

		if (toFeature) {
			secondBatchPromises.push(
				updateFeature({
					ctx: newContext,
					featureId: fromFeature.id,
					updates: fromFeature,
				}),
			);
		} else {
			secondBatchPromises.push(
				createFeature({
					ctx: newContext,
					data: fromFeature,
				}),
			);
		}
	}
	await Promise.all(secondBatchPromises);
};
