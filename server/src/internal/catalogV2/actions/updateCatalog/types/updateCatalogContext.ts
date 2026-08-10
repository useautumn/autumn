import type { CatalogFeatureUsageBucket, Feature } from "@autumn/shared";

/**
 * Per-feature dependency state from setup. Existence flags always; rewrite
 * COUNTs (and overflow) only when the batch entry may rewrite references.
 */
export type FeatureState = {
	has_customers: boolean;
	has_entitlements: boolean;
	has_loose_entitlements: boolean;
	has_entity_feature_entitlements: boolean;
	has_loose_entity_feature_entitlements: boolean;
	has_prices: boolean;
	/** Credit systems from ctx.features whose schema references this feature. */
	credit_system_feature_ids: string[];
	/** Credit system Feature rows (same source), for id-rewrite schema updates. */
	creditSystems: Feature[];

	/** True when a rewrite COUNT exceeded FEATURE_REWRITE_ROW_LIMIT. */
	entitlementsOverflow: boolean;
	entityFeatureIdEntitlementsOverflow: boolean;
	pricesOverflow: boolean;
};

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

/** Everything setup fetches; compute and errors read only from here. */
export interface UpdateCatalogContext {
	/** Dependency + rewrite overflow flags, keyed by feature id. */
	featureStatesContext: Record<string, FeatureState>;
	/** Present iff the action ran with preview: true. */
	previewContext?: PreviewCatalogContext;
}
