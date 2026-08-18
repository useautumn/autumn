import type { AppEnv } from "@autumn/shared";

/**
 * Org-scoped predicates for catalogV2 feature reference rewrites.
 *
 * Never filter by public feature.id alone — it is only unique per org.
 *
 * Granting entitlements:
 *   entitlements ⋈ features ON internal_id
 *   WHERE internal_feature_id = $internalFeatureId
 *     AND features.org_id = $orgId AND features.env = $env
 *
 * entity_feature_id entitlements (public id — must be org-scoped):
 *   entitlements ⋈ features ON granting feature.internal_id
 *   WHERE entity_feature_id = $featureId
 *     AND features.org_id = $orgId AND features.env = $env
 *
 * Prices:
 *   WHERE prices.org_id = $orgId
 *     AND config->>'internal_feature_id' = $internalFeatureId
 *
 * Keep listFeatureStates COUNTs and executeFeatureReferenceRewrites UPDATEs
 * in lockstep with these predicates.
 */
export const FEATURE_REWRITE_ROW_LIMIT = 100;

export type FeatureRewriteScopeIds = {
	orgId: string;
	env: AppEnv;
	internalFeatureId: string;
	featureId: string;
};
