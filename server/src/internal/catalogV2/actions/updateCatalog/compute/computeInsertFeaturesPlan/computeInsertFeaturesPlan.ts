import {
	type Feature,
	type FeatureType,
	featureV1ToDbFeature,
	isAnyCreditSystem,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	CatalogComputeStep,
	ProjectedCatalog,
} from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import { validateFeature } from "@/internal/features/utils/validateFeature.js";
import { generateId } from "@/utils/genUtils.js";

/** Credit systems last so schema refs see metered/boolean rows from this batch. */
const sortFeaturesForInsert = <T extends { type: string }>(features: T[]): T[] =>
	[...features].sort((left, right) => {
		const leftCredit = isAnyCreditSystem(left.type as FeatureType);
		const rightCredit = isAnyCreditSystem(right.type as FeatureType);
		if (leftCredit === rightCredit) return 0;
		return leftCredit ? 1 : -1;
	});

/**
 * Features in the batch that don't exist yet. Validates against the projected
 * catalog (post-update) so a new CS can reference a feature this call updates.
 */
export const computeInsertFeaturesPlan = ({
	ctx,
	params,
	projected,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	projected: ProjectedCatalog;
}): CatalogComputeStep => {
	const originalById = new Map(
		ctx.features.map((feature) => [feature.id, feature]),
	);

	const entries = sortFeaturesForInsert(
		params.features.filter(
			(featureParams) => !originalById.has(featureParams.feature_id),
		),
	);

	const insertFeatures: Feature[] = [];
	let workingFeatures = [...projected.features];

	for (const featureParams of entries) {
		const dbFeature = featureV1ToDbFeature({
			apiFeature: { id: featureParams.feature_id, ...featureParams },
		});
		const parsedFeature = validateFeature({
			data: dbFeature,
			allFeatures: workingFeatures,
		});

		const feature: Feature = {
			archived: false,
			internal_id: generateId("fe"),
			org_id: ctx.org.id,
			created_at: Date.now(),
			env: ctx.env,
			...parsedFeature,
			model_markups: dbFeature.model_markups ?? null,
		};
		insertFeatures.push(feature);
		workingFeatures = [...workingFeatures, feature];
	}

	return { insertFeatures };
};
