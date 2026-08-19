import type { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";

export { FEATURE_REWRITE_ROW_LIMIT };

export const FeatureStateRowSchema = z.object({
	internal_feature_id: z.string(),
	feature_id: z.string(),
	has_entitlements: z.boolean(),
	has_loose_entitlements: z.boolean(),
	has_entity_feature_entitlements: z.boolean(),
	has_loose_entity_feature_entitlements: z.boolean(),
	has_prices: z.boolean(),
	has_customers: z.boolean(),
	entitlement_count: z.number().int(),
	entity_feature_id_entitlement_count: z.number().int(),
	price_count: z.number().int(),
	entitlements_overflow: z.boolean(),
	entity_feature_id_entitlements_overflow: z.boolean(),
	prices_overflow: z.boolean(),
});

export type FeatureStateRow = z.infer<typeof FeatureStateRowSchema>;

/**
 * One round-trip: existence flags for every candidate + rewrite COUNTs when
 * count_rows is true (overflow = count > FEATURE_REWRITE_ROW_LIMIT).
 */
export const buildFeatureStatesQuery = ({
	features,
	orgId,
	env,
	limit = FEATURE_REWRITE_ROW_LIMIT,
}: {
	features: { internalId: string; id: string; countRows: boolean }[];
	orgId: string;
	env: AppEnv;
	limit?: number;
}) => {
	const internalIds = features.map((feature) => feature.internalId);
	const ids = features.map((feature) => feature.id);
	const countRows = features.map((feature) => feature.countRows);

	return sql`
		SELECT
			candidate.internal_feature_id,
			candidate.feature_id,
			entitlement_product.found IS NOT NULL AS has_entitlements,
			entitlement_loose.found IS NOT NULL AS has_loose_entitlements,
			entity_product.found IS NOT NULL AS has_entity_feature_entitlements,
			entity_loose.found IS NOT NULL AS has_loose_entity_feature_entitlements,
			price_usage.found IS NOT NULL AS has_prices,
			customer_usage.found IS NOT NULL AS has_customers,
			coalesce(entitlement_counts.count, 0)::int AS entitlement_count,
			coalesce(entity_counts.count, 0)::int AS entity_feature_id_entitlement_count,
			coalesce(price_counts.count, 0)::int AS price_count,
			coalesce(entitlement_counts.count, 0) > ${limit} AS entitlements_overflow,
			coalesce(entity_counts.count, 0) > ${limit}
				AS entity_feature_id_entitlements_overflow,
			coalesce(price_counts.count, 0) > ${limit} AS prices_overflow
		FROM unnest(
			${sql.param(internalIds)}::text[],
			${sql.param(ids)}::text[],
			${sql.param(countRows)}::boolean[]
		) AS candidate(internal_feature_id, feature_id, count_rows)
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.internal_feature_id COLLATE "C"
				= candidate.internal_feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
				AND entitlement.internal_product_id IS NOT NULL
			LIMIT 1
		) entitlement_product ON true
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.internal_feature_id COLLATE "C"
				= candidate.internal_feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
				AND entitlement.internal_product_id IS NULL
			LIMIT 1
		) entitlement_loose ON true
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.entity_feature_id = candidate.feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
				AND entitlement.internal_product_id IS NOT NULL
			LIMIT 1
		) entity_product ON true
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE entitlement.entity_feature_id = candidate.feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
				AND entitlement.internal_product_id IS NULL
			LIMIT 1
		) entity_loose ON true
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM prices price
			WHERE price.org_id = ${orgId}
				AND price.config ->> 'internal_feature_id'
					= candidate.internal_feature_id
			LIMIT 1
		) price_usage ON true
		LEFT JOIN LATERAL (
			SELECT 1 AS found
			FROM customer_entitlements customer_entitlement
			JOIN features feature
				ON feature.internal_id = customer_entitlement.internal_feature_id
			WHERE customer_entitlement.internal_feature_id COLLATE "C"
				= candidate.internal_feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
			LIMIT 1
		) customer_usage ON true
		LEFT JOIN LATERAL (
			SELECT count(*)::int AS count
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE candidate.count_rows
				AND entitlement.internal_feature_id COLLATE "C"
					= candidate.internal_feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
		) entitlement_counts ON true
		LEFT JOIN LATERAL (
			SELECT count(*)::int AS count
			FROM entitlements entitlement
			JOIN features feature
				ON feature.internal_id = entitlement.internal_feature_id
			WHERE candidate.count_rows
				AND entitlement.entity_feature_id = candidate.feature_id
				AND feature.org_id = ${orgId}
				AND feature.env = ${env}
		) entity_counts ON true
		LEFT JOIN LATERAL (
			SELECT count(*)::int AS count
			FROM prices price
			WHERE candidate.count_rows
				AND price.org_id = ${orgId}
				AND price.config ->> 'internal_feature_id'
					= candidate.internal_feature_id
		) price_counts ON true
	`;
};

export const listFeatureStates = async ({
	db,
	features,
	orgId,
	env,
}: {
	db: DrizzleCli;
	features: { internalId: string; id: string; countRows: boolean }[];
	orgId: string;
	env: AppEnv;
}): Promise<FeatureStateRow[]> => {
	if (features.length === 0) return [];

	const rows = await db.execute(
		buildFeatureStatesQuery({ features, orgId, env }),
	);
	return [...rows].map((row) => FeatureStateRowSchema.parse(row));
};
