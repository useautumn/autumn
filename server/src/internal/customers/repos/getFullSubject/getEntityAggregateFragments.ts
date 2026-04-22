import { type SQL, sql } from "drizzle-orm";
import { getEntityOptionsAggregateFragments } from "./getEntityOptionsAggregateFragments.js";

/**
 * Rollover CTEs driven from the shared `entity_product_cus_ents` and
 * `entity_loose_cus_ents` base CTEs — avoids re-scanning `customer_entitlements`
 * and `customer_products` per branch.
 */
const buildEntityRolloverCtes = () => sql`
		entity_rollover_rows AS (
			-- Top-level rollover: one row per (rollover × cus_ent).
			-- entity_key = cp.internal_entity_id for product-attached, ce.internal_entity_id for loose.
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				COALESCE(ce.cp_entity_key, ce.internal_entity_id) AS entity_key,
				r.balance::numeric AS rollover_balance,
				COALESCE(r.usage, 0)::numeric AS rollover_usage
			FROM rollovers r
			JOIN entity_level_cus_ents ce ON r.cus_ent_id = ce.id
			WHERE (r.expires_at IS NULL OR r.expires_at > EXTRACT(EPOCH FROM now()) * 1000)

			UNION ALL

			-- Per-entity rollover from jsonb_each(r.entities).
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				kv.entity_key AS entity_key,
				COALESCE((kv.entity_value->>'balance')::numeric, 0) AS rollover_balance,
				COALESCE((kv.entity_value->>'usage')::numeric, 0) AS rollover_usage
			FROM rollovers r
			JOIN entity_level_cus_ents ce ON r.cus_ent_id = ce.id
			CROSS JOIN LATERAL jsonb_each(r.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(r.entities) = 'object'
				AND (r.expires_at IS NULL OR r.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		entity_rollover_keys AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				entity_key,
				SUM(rollover_balance) AS rollover_balance,
				SUM(rollover_usage) AS rollover_usage
			FROM entity_rollover_rows
			WHERE entity_key IS NOT NULL
			GROUP BY internal_feature_id, internal_customer_id, entity_key
		),

		entity_rollover_feature AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				SUM(rollover_balance) AS rollover_balance,
				SUM(rollover_usage) AS rollover_usage
			FROM entity_rollover_rows
			GROUP BY internal_feature_id, internal_customer_id
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

		entity_balance_rows AS (
			-- Top-level: one row per cus_ent (product-attached or loose).
			-- entity_key = cp.internal_entity_id for product-attached, ce.internal_entity_id for loose.
			SELECT
				COALESCE(ce.external_id, ce.id) AS api_id,
				ce.internal_feature_id,
				ce.internal_customer_id,
				ce.feature_id,
				COALESCE(ent.allowance, 0)::numeric AS allowance,
				ce.balance::numeric AS balance,
				COALESCE(ce.adjustment, 0)::numeric AS adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS additional_balance,
				ce.unlimited,
				ce.usage_allowed,
				COALESCE(ce.cp_entity_key, ce.internal_entity_id) AS entity_key,
				ce.balance::numeric AS entity_balance,
				COALESCE(ce.adjustment, 0)::numeric AS entity_adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS entity_additional_balance
			FROM entity_level_cus_ents ce
			JOIN entitlements ent ON ce.entitlement_id = ent.id

			UNION ALL

			-- Per-entity: N rows per cus_ent from jsonb_each(ce.entities).
			-- balance/adj/additional = 0 to avoid double-counting at the aggregate level.
			SELECT
				COALESCE(ce.external_id, ce.id) AS api_id,
				ce.internal_feature_id,
				ce.internal_customer_id,
				ce.feature_id,
				COALESCE(ent.allowance, 0)::numeric AS allowance,
				0::numeric AS balance,
				0::numeric AS adjustment,
				0::numeric AS additional_balance,
				ce.unlimited,
				ce.usage_allowed,
				kv.entity_key AS entity_key,
				(kv.entity_value->>'balance')::numeric AS entity_balance,
				COALESCE((kv.entity_value->>'adjustment')::numeric, 0) AS entity_adjustment,
				COALESCE((kv.entity_value->>'additional_balance')::numeric, 0) AS entity_additional_balance
			FROM entity_level_cus_ents ce
			JOIN entitlements ent ON ce.entitlement_id = ent.id
			CROSS JOIN LATERAL jsonb_each(ce.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(ce.entities) = 'object'
		),

		${buildEntityRolloverCtes()},

		entity_balance_keys AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				entity_key,
				SUM(entity_balance) AS balance,
				SUM(entity_adjustment) AS adjustment,
				SUM(entity_additional_balance) AS additional_balance
			FROM entity_balance_rows
			WHERE entity_key IS NOT NULL
			GROUP BY internal_feature_id, internal_customer_id, entity_key
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

		entity_aggregate_totals AS (
			SELECT
				MIN(ebr.api_id) AS api_id,
				ebr.internal_feature_id,
				ebr.internal_customer_id,
				MIN(ebr.feature_id) AS feature_id,
				SUM(ebr.allowance) AS allowance_total,
				SUM(ebr.balance) AS balance,
				SUM(ebr.adjustment) AS adjustment,
				SUM(ebr.additional_balance) AS additional_balance,
				BOOL_OR(ebr.unlimited) AS unlimited,
				BOOL_OR(ebr.usage_allowed) AS usage_allowed,
				COUNT(DISTINCT ebr.entity_key) FILTER (WHERE ebr.entity_key IS NOT NULL) AS entity_count
			FROM entity_balance_rows ebr
			GROUP BY ebr.internal_feature_id, ebr.internal_customer_id
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
				eat.entity_count,
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
