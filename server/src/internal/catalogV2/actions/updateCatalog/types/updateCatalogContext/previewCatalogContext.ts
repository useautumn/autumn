import type { CatalogFeatureUsageBucket } from "@autumn/shared";

/** Persisted row evidence only — frozen even once the batch can edit plans.
 *  Batch plan/CS effects are overlaid in buildFeatureUsage, never fetched here. */
export type PersistedFeatureUsage = {
	plans: CatalogFeatureUsageBucket;
	customers: CatalogFeatureUsageBucket;
};

/** Presentation facts fetched only for preview runs — never read by compute,
 *  errors, or execute. */
export type PreviewCatalogContext = {
	featureUsagePersisted: Record<string, PersistedFeatureUsage>;
};
