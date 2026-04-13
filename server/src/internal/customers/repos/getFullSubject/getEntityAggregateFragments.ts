import { type SQL, sql } from "drizzle-orm";

/**
 * Builds all entity-scoped SQL fragments for customer-level queries.
 * Returns empty fragments when `entityId` is set (entity-level query).
 */
export const getEntityAggregateFragments = ({
	entityId,
	statusFilter,
}: {
	entityId?: string;
	statusFilter: SQL;
}) => {
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

	const ctes = sql`,

		entity_distinct_product_ids AS (
			SELECT DISTINCT cp.internal_product_id, cp.internal_customer_id
			FROM customer_products cp
			JOIN subject_customer_records scr
				ON cp.internal_customer_id = scr.internal_id
			WHERE cp.internal_entity_id IS NOT NULL
				${statusFilter}
		),

		entity_distinct_cus_products AS (
			SELECT sub.*
			FROM entity_distinct_product_ids edpi
			JOIN LATERAL (
				SELECT cp.*
				FROM customer_products cp
				WHERE cp.internal_customer_id = edpi.internal_customer_id
					AND cp.internal_product_id = edpi.internal_product_id
					AND cp.internal_entity_id IS NOT NULL
					${statusFilter}
				ORDER BY cp.created_at DESC
				LIMIT 1
			) sub ON true
		),

		entity_cus_prices AS (
			SELECT cpr.*
			FROM customer_prices cpr
			WHERE cpr.customer_product_id IN (SELECT id FROM entity_distinct_cus_products)
		),

		entity_balance_rows AS (
			SELECT
				COALESCE(ce.external_id, ce.id) AS api_id,
				ce.internal_feature_id,
				ce.internal_customer_id,
				ce.feature_id,
				COALESCE(ent.allowance, 0)::numeric AS allowance,
				ce.balance::numeric AS balance,
				ce.adjustment::numeric AS adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS additional_balance,
				ce.unlimited,
				ce.usage_allowed,
				cp.internal_entity_id AS entity_key,
				ce.balance::numeric AS entity_balance,
				COALESCE(ce.adjustment, 0)::numeric AS entity_adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS entity_additional_balance
			FROM customer_entitlements ce
			JOIN customer_products cp ON ce.customer_product_id = cp.id
			JOIN entitlements ent ON ce.entitlement_id = ent.id
			WHERE ce.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
				AND cp.internal_entity_id IS NOT NULL
				${statusFilter}

			UNION ALL

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
			FROM cus_entitlements ce
			JOIN entitlements ent ON ce.entitlement_id = ent.id
			CROSS JOIN LATERAL jsonb_each(ce.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(ce.entities) = 'object'

			UNION ALL

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
				ce.internal_entity_id AS entity_key,
				ce.balance::numeric AS entity_balance,
				COALESCE(ce.adjustment, 0)::numeric AS entity_adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS entity_additional_balance
			FROM customer_entitlements ce
			JOIN entitlements ent ON ce.entitlement_id = ent.id
			WHERE ce.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
				AND ce.customer_product_id IS NULL
				AND ce.internal_entity_id IS NOT NULL
				AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		entity_aggregate_keys AS (
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
				internal_feature_id,
				internal_customer_id,
				jsonb_object_agg(
					entity_key,
					jsonb_build_object(
						'id', entity_key,
						'balance', balance,
						'adjustment', adjustment,
						'additional_balance', additional_balance
					)
				) AS entities
			FROM entity_aggregate_keys
			GROUP BY internal_feature_id, internal_customer_id
		),

		entity_aggregated_cus_entitlements AS (
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
				COUNT(DISTINCT ebr.entity_key) FILTER (WHERE ebr.entity_key IS NOT NULL) AS entity_count,
				eam.entities
			FROM entity_balance_rows ebr
			LEFT JOIN entity_aggregate_map eam
				ON eam.internal_feature_id = ebr.internal_feature_id
				AND eam.internal_customer_id = ebr.internal_customer_id
			GROUP BY
				ebr.internal_feature_id,
				ebr.internal_customer_id,
				eam.entities
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
		FROM customer_entitlements ce
		JOIN customer_products cp ON ce.customer_product_id = cp.id
		WHERE cp.internal_entity_id IS NOT NULL
			${statusFilter}

		UNION
		SELECT DISTINCT
			ce.internal_customer_id,
			ce.entitlement_id
		FROM customer_entitlements ce
		WHERE ce.customer_product_id IS NULL
			AND ce.internal_entity_id IS NOT NULL
			AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
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
