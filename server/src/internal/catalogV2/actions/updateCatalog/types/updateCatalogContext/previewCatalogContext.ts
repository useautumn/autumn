import type { CatalogFeatureUsageBucket } from "@autumn/shared";

export type PersistedFeatureUsage = {
	plans: CatalogFeatureUsageBucket;
	customers: CatalogFeatureUsageBucket;
};

export type PersistedPlanUsage = {
	customers: CatalogFeatureUsageBucket;
};

export type PreviewCatalogContext = {
	featureUsagePersisted: Record<string, PersistedFeatureUsage>;
	planUsagePersisted: Record<string, PersistedPlanUsage>;
};
