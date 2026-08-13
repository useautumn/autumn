import {
	type CatalogFeatureUsage,
	type CatalogFeatureUsageBucket,
	emptyCatalogFeatureUsageBucket,
	type Feature,
} from "@autumn/shared";
import type { PreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import {
	FEATURE_USAGE_COUNT_CAP,
	FEATURE_USAGE_SAMPLE_LIMIT,
} from "@/internal/features/repos/listFeatureUsageSummaries.js";

const buildProjectedCreditSystemsBucket = ({
	featureIds,
	projectedFeatures,
}: {
	featureIds: string[];
	projectedFeatures: Feature[];
}): CatalogFeatureUsageBucket => {
	const creditSystemsById = new Map<string, Feature>();
	for (const featureId of featureIds) {
		for (const creditSystem of getCreditSystemsFromFeature({
			featureId,
			features: projectedFeatures,
		})) {
			creditSystemsById.set(creditSystem.id, creditSystem);
		}
	}
	const creditSystems = [...creditSystemsById.values()];
	const creditSystemCount = creditSystems.length;

	return {
		count: Math.min(creditSystemCount, FEATURE_USAGE_COUNT_CAP),
		count_capped: creditSystemCount > FEATURE_USAGE_COUNT_CAP,
		samples: creditSystems
			.slice(0, FEATURE_USAGE_SAMPLE_LIMIT)
			.map((creditSystem) => ({
				id: creditSystem.id,
				name: creditSystem.name || creditSystem.id,
			})),
	};
};

/** Composes buckets as post-batch surviving references.
 *  Plan upserts' overlay (persisted − batch-removed + batch-drafted) is a new input here — not setup/SQL. */
export const buildFeatureUsage = ({
	featureIds,
	previewContext,
	projectedFeatures,
}: {
	featureIds: string[];
	previewContext: PreviewCatalogContext | undefined;
	projectedFeatures: Feature[];
}): CatalogFeatureUsage => {
	const persistedById = previewContext?.featureUsagePersisted;
	const persisted = featureIds
		.map((featureId) => persistedById?.[featureId])
		.find((entry) => entry !== undefined);

	return {
		plans: persisted?.plans ?? emptyCatalogFeatureUsageBucket(),
		customers: persisted?.customers ?? emptyCatalogFeatureUsageBucket(),
		credit_systems: buildProjectedCreditSystemsBucket({
			featureIds,
			projectedFeatures,
		}),
	};
};
