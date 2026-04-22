import { type SQL, sql } from "drizzle-orm";
import { getEntityOptionsAggregateFragments } from "./getEntityOptionsAggregateFragments.js";

/**
 * Rollover CTEs:
 *   - entity_rollover_keys: per-entity rollover balances, built ONLY from
 *     jsonb_each(r.entities). Keys only exist in the map when a rollover row
 *     explicitly carries a per-entity breakdown.
 *   - entity_rollover_feature: feature-level rollover totals, summed directly
 *     off r.balance / r.usage (one add per active rollover).
 */
const buildEntityRolloverCtes = () => sql`
		entity_rollover_keys AS (
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				kv.entity_key AS entity_key,
				SUM(COALESCE((kv.entity_value->>'balance')::numeric, 0)) AS rollover_balance,
				SUM(COALESCE((kv.entity_value->>'usage')::numeric, 0)) AS rollover_usage
			FROM rollovers r
			JOIN entity_level_cus_ents ce ON r.cus_ent_id = ce.id
			CROSS JOIN LATERAL jsonb_each(r.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(r.entities) = 'object'
				AND (r.expires_at IS NULL OR r.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
			GROUP BY ce.internal_feature_id, ce.internal_customer_id, kv.entity_key
		),

		entity_rollover_feature AS (
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				SUM(r.balance::numeric) AS rollover_balance,
				SUM(COALESCE(r.usage, 0)::numeric) AS rollover_usage
			FROM rollovers r
			JOIN entity_level_cus_ents ce ON r.cus_ent_id = ce.id
			WHERE (r.expires_at IS NULL OR r.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
			GROUP BY ce.internal_feature_id, ce.internal_customer_id
		)
`;

export const getEntityAggregateFragments = ({
	entityId,
	statusFilter,
	internalFeatureIds,
}: {
	entityId?: string;
	statusFilter: SQL;
	internalFeatureIds?: string[];
}) => {
	const featureFilter =
		internalFeatureIds && internalFeatureIds.length > 0
			? sql`AND ce.internal_feature_id = ANY(ARRAY[${sql.join(
					internalFeatureIds.map((internalFeatureId) => sql`${internalFeatureId}`),
					sql`, `,
				)}])`
			: sql``;

	if (entityId) {
		return {
			ctes: sql``,
			productRefsUnion: sql``,
			entitlementRefsUnion: sql``,
			priceRefsUnion: sql``,
			freeTrialRefsUnion: sql``,
			selectColumns: sql``,
		};
	}

	const entityOptionsAggregateFragments = getEntityOptionsAggregateFragments();

	const ctes = sql`,

		-- (A) Subject's entity-level customer_products, filtered once.
		entity_cus_products AS (
			SELECT cp.*
			FROM customer_products cp
			WHERE cp.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
				AND cp.internal_entity_id IS NOT NULL
				${statusFilter}
		),

		-- (B) All entity-level cus_ents for the subject — product-attached (with
		-- cp_entity_key set) and loose (cp_entity_key = NULL). Filtered once.
		entity_level_cus_ents AS (
			SELECT ce.*, cp.internal_entity_id AS cp_entity_key
			FROM entity_cus_products cp
			JOIN customer_entitlements ce ON ce.customer_product_id = cp.id
			WHERE 1 = 1
				${featureFilter}

			UNION ALL

			SELECT ce.*, NULL::text AS cp_entity_key
			FROM customer_entitlements ce
			WHERE ce.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
				AND ce.customer_product_id IS NULL
				AND ce.internal_entity_id IS NOT NULL
				AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
				AND ce.balance != 0
				${featureFilter}
		),

		-- Most-recent customer_product per (customer, product) — replaces the old
		-- DISTINCT + LATERAL dance in entity_distinct_cus_products.
		entity_distinct_cus_products AS (
			SELECT *
			FROM (
				SELECT
					cp.*,
					ROW_NUMBER() OVER (
						PARTITION BY cp.internal_customer_id, cp.internal_product_id
						ORDER BY cp.created_at DESC
					) AS rn
				FROM entity_cus_products cp
			) ranked
			WHERE ranked.rn = 1
		),

		entity_cus_prices AS (
			SELECT cpr.*
			FROM customer_prices cpr
			WHERE cpr.customer_product_id IN (SELECT id FROM entity_distinct_cus_products)
		),

		${entityOptionsAggregateFragments.ctes},

		${buildEntityRolloverCtes()},

		-- Per-entity balance map: built ONLY from jsonb_each(ce.entities) so
		-- that entities keys reflect real per-entity breakdowns, not every
		-- product-attached cus_ent. Summed across cus_ents for the same key.
		entity_balance_keys AS (
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				kv.entity_key,
				SUM((kv.entity_value->>'balance')::numeric) AS balance,
				SUM(COALESCE((kv.entity_value->>'adjustment')::numeric, 0)) AS adjustment,
				SUM(COALESCE((kv.entity_value->>'additional_balance')::numeric, 0)) AS additional_balance
			FROM entity_level_cus_ents ce
			CROSS JOIN LATERAL jsonb_each(ce.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(ce.entities) = 'object'
			GROUP BY ce.internal_feature_id, ce.internal_customer_id, kv.entity_key
		),

		entity_aggregate_map AS (
			SELECT
				ejk.internal_feature_id,
				ejk.internal_customer_id,
				jsonb_object_agg(
					ejk.entity_key,
					jsonb_build_object(
						'id', ejk.entity_key,
						'balance', ejk.balance,
						'adjustment', ejk.adjustment,
						'additional_balance', ejk.additional_balance,
						'rollover_balance', COALESCE(erk.rollover_balance, 0),
						'rollover_usage', COALESCE(erk.rollover_usage, 0)
					)
				) AS entities
			FROM (
				SELECT *
				FROM entity_balance_keys

				UNION ALL

				SELECT
					erk.internal_feature_id,
					erk.internal_customer_id,
					erk.entity_key,
					0::numeric AS balance,
					0::numeric AS adjustment,
					0::numeric AS additional_balance
				FROM entity_rollover_keys erk
				WHERE NOT EXISTS (
					SELECT 1
					FROM entity_balance_keys ebk
					WHERE ebk.internal_feature_id = erk.internal_feature_id
						AND ebk.internal_customer_id = erk.internal_customer_id
						AND ebk.entity_key = erk.entity_key
				)
			) ejk
			LEFT JOIN entity_rollover_keys erk
				ON erk.internal_feature_id = ejk.internal_feature_id
				AND erk.internal_customer_id = ejk.internal_customer_id
				AND erk.entity_key = ejk.entity_key
			GROUP BY ejk.internal_feature_id, ejk.internal_customer_id
		),

		-- Feature-level totals: summed directly off entity_level_cus_ents
		-- (one add per cus_ent).
		entity_aggregate_totals AS (
			SELECT
				MIN(COALESCE(ce.external_id, ce.id)) AS api_id,
				ce.internal_feature_id,
				ce.internal_customer_id,
				MIN(ce.feature_id) AS feature_id,
				SUM(COALESCE(ent.allowance, 0)::numeric) AS allowance_total,
				SUM(ce.balance::numeric) AS balance,
				SUM(COALESCE(ce.adjustment, 0)::numeric) AS adjustment,
				SUM(COALESCE(ce.additional_balance, 0)::numeric) AS additional_balance,
				BOOL_OR(ce.unlimited) AS unlimited,
				BOOL_OR(ce.usage_allowed) AS usage_allowed
			FROM entity_level_cus_ents ce
			JOIN entitlements ent ON ce.entitlement_id = ent.id
			GROUP BY ce.internal_feature_id, ce.internal_customer_id
		),

		entity_aggregated_cus_entitlements AS (
			SELECT
				eat.api_id,
				eat.internal_feature_id,
				eat.internal_customer_id,
				eat.feature_id,
				eat.allowance_total,
				COALESCE(epgo.prepaid_grant_from_options, 0) AS prepaid_grant_from_options,
				eat.balance,
				eat.adjustment,
				eat.additional_balance,
				COALESCE(erf.rollover_balance, 0) AS rollover_balance,
				COALESCE(erf.rollover_usage, 0) AS rollover_usage,
				eat.unlimited,
				eat.usage_allowed,
				eam.entities
			FROM entity_aggregate_totals eat
			LEFT JOIN entity_aggregate_map eam
				ON eam.internal_feature_id = eat.internal_feature_id
				AND eam.internal_customer_id = eat.internal_customer_id
			LEFT JOIN entity_rollover_feature erf
				ON erf.internal_feature_id = eat.internal_feature_id
				AND erf.internal_customer_id = eat.internal_customer_id
			LEFT JOIN entity_prepaid_grant_from_options epgo
				ON epgo.internal_feature_id = eat.internal_feature_id
				AND epgo.internal_customer_id = eat.internal_customer_id
		)
	`;

	const productRefsUnion = sql`
		UNION ALL
		SELECT ecp.internal_customer_id, ecp.internal_product_id
		FROM entity_distinct_cus_products ecp
	`;

	const entitlementRefsUnion = sql`
		UNION
		SELECT DISTINCT
			ce.internal_customer_id,
			ce.entitlement_id
		FROM entity_level_cus_ents ce
	`;

	const priceRefsUnion = sql`
		UNION ALL
		SELECT ecpr.price_id, ecp.internal_customer_id
		FROM entity_cus_prices ecpr
		JOIN entity_distinct_cus_products ecp
			ON ecp.id = ecpr.customer_product_id
	`;

	const freeTrialRefsUnion = sql`
		UNION ALL
		SELECT ecp.free_trial_id, ecp.internal_customer_id
		FROM entity_distinct_cus_products ecp
		WHERE ecp.free_trial_id IS NOT NULL
	`;

	const selectColumns = sql`,

		json_build_object(
			'aggregated_customer_products', COALESCE(
				(
					SELECT json_agg(row_to_json(ecp))
					FROM entity_distinct_cus_products ecp
					WHERE ecp.internal_customer_id = scr.internal_id
				),
				'[]'::json
			),
			'aggregated_customer_entitlements', COALESCE(
				(
					SELECT json_agg(row_to_json(eace))
					FROM entity_aggregated_cus_entitlements eace
					WHERE eace.internal_customer_id = scr.internal_id
				),
				'[]'::json
			)
		) AS entity_aggregations
	`;

	return {
		ctes,
		productRefsUnion,
		entitlementRefsUnion,
		priceRefsUnion,
		freeTrialRefsUnion,
		selectColumns,
	};
};
