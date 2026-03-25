import type { AppEnv, CusProductStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";

/**
 * Builds all entity-scoped SQL fragments for customer-level queries.
 * Returns empty fragments when `entityId` is set (entity-level query).
 */
const getEntityAggregateFragments = ({
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
				ce.internal_feature_id,
				ce.internal_customer_id,
				ce.feature_id,
				ce.balance::numeric AS balance,
				ce.adjustment::numeric AS adjustment,
				COALESCE(ce.additional_balance, 0)::numeric AS additional_balance,
				ce.unlimited,
				ce.usage_allowed,
				1 AS entity_row_count,
				NULL::text AS old_entity_key,
				NULL::numeric AS old_entity_balance,
				NULL::numeric AS old_entity_adjustment,
				NULL::numeric AS old_entity_additional_balance
			FROM customer_entitlements ce
			JOIN customer_products cp ON ce.customer_product_id = cp.id
			WHERE ce.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
				AND cp.internal_entity_id IS NOT NULL

			UNION ALL

			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				ce.feature_id,
				0::numeric AS balance,
				0::numeric AS adjustment,
				0::numeric AS additional_balance,
				ce.unlimited,
				ce.usage_allowed,
				0 AS entity_row_count,
				kv.entity_key AS old_entity_key,
				(kv.entity_value->>'balance')::numeric AS old_entity_balance,
				COALESCE((kv.entity_value->>'adjustment')::numeric, 0) AS old_entity_adjustment,
				COALESCE((kv.entity_value->>'additional_balance')::numeric, 0) AS old_entity_additional_balance
			FROM cus_entitlements ce,
				jsonb_each(ce.entities) AS kv(entity_key, entity_value)
			WHERE jsonb_typeof(ce.entities) = 'object'
		),

		entity_old_style_keys AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				old_entity_key,
				SUM(old_entity_balance) AS balance,
				SUM(old_entity_adjustment) AS adjustment,
				SUM(old_entity_additional_balance) AS additional_balance
			FROM entity_balance_rows
			WHERE old_entity_key IS NOT NULL
			GROUP BY internal_feature_id, internal_customer_id, old_entity_key
		),

		entity_old_style_map AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				jsonb_object_agg(
					old_entity_key,
					jsonb_build_object(
						'id', old_entity_key,
						'balance', balance,
						'adjustment', adjustment,
						'additional_balance', additional_balance
					)
				) AS entities
			FROM entity_old_style_keys
			GROUP BY internal_feature_id, internal_customer_id
		),

		entity_aggregated_cus_entitlements AS (
			SELECT
				ebr.internal_feature_id,
				ebr.internal_customer_id,
				MIN(ebr.feature_id) AS feature_id,
				SUM(ebr.balance) AS balance,
				SUM(ebr.adjustment) AS adjustment,
				SUM(ebr.additional_balance) AS additional_balance,
				BOOL_OR(ebr.unlimited) AS unlimited,
				BOOL_OR(ebr.usage_allowed) AS usage_allowed,
				SUM(ebr.entity_row_count) AS entity_count,
				eom.entities
			FROM entity_balance_rows ebr
			LEFT JOIN entity_old_style_map eom
				ON eom.internal_feature_id = ebr.internal_feature_id
				AND eom.internal_customer_id = ebr.internal_customer_id
			GROUP BY
				ebr.internal_feature_id,
				ebr.internal_customer_id,
				eom.entities
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
			),
			'aggregated_customer_prices', COALESCE(
				(
					SELECT json_agg(row_to_json(ecpr))
					FROM entity_cus_prices ecpr
					JOIN entity_distinct_cus_products ecp
						ON ecp.id = ecpr.customer_product_id
					WHERE ecp.internal_customer_id = scr.internal_id
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

export const getSubjectCoreQuery = ({
	orgId,
	env,
	customerId,
	entityId,
	pagination = {
		page: 50,
		offset: 0,
	},
	inStatuses = RELEVANT_STATUSES,
}: {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	entityId?: string;
	pagination?: {
		page?: number;
		offset?: number;
	};
	inStatuses?: CusProductStatus[];
}) => {
	const page = pagination.page ?? 50;
	const offset = pagination.offset ?? 0;

	const statusFilter =
		inStatuses.length > 0
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;

	const customerFilter = customerId
		? sql`AND (c.id = ${customerId} OR c.internal_id = ${customerId})`
		: sql``;

	const customerPagination = customerId
		? sql`
			ORDER BY (c.id = ${customerId}) DESC
			LIMIT 1
		`
		: sql`
			ORDER BY c.created_at DESC
			LIMIT ${page}
			OFFSET ${offset}
		`;

	const entityRecordCte = entityId
		? sql`,
		entity_record AS (
			SELECT e.*
			FROM entities e
			WHERE e.internal_customer_id IN (
				SELECT internal_id
				FROM subject_customer_records
			)
				AND (e.id = ${entityId} OR e.internal_id = ${entityId})
			LIMIT 1
		)
	`
		: sql``;

	const customerProductEntityFilter = entityId
		? sql`AND cp.internal_entity_id = (SELECT internal_id FROM entity_record LIMIT 1)`
		: sql`AND cp.internal_entity_id IS NULL`;

	const entityFragments = getEntityAggregateFragments({
		entityId,
		statusFilter,
	});

	const subjectCustomerFilter = entityId
		? sql`
			WHERE scr.internal_id = (
				SELECT internal_customer_id
				FROM entity_record
				LIMIT 1
			)
		`
		: sql``;

	/**
	 * Builds the normalized subject-core query used by both single-customer and
	 * list-customer reads.
	 *
	 * The result shape is always one row per matched customer with flat JSON arrays
	 * for customer products, customer entitlements, prices, rollovers, products,
	 * entitlements, and free trials. Callers can then hydrate that payload into a
	 * `FullCustomer`-style object in TypeScript.
	 *
	 * Behavior:
	 * - `customerId`: narrows to a single customer lookup.
	 * - `pagination`: applies only when listing customers.
	 * - `entityId`: switches product selection to the matching entity-scoped
	 *   customer products and limits the final rowset to that entity's customer.
	 * - `inStatuses`: filters customer products before downstream joins.
	 */
	return sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				${customerFilter}
			${customerPagination}
		)
		${entityRecordCte}
		,

		cus_products AS (
			SELECT cp.*
			FROM customer_products cp
			JOIN subject_customer_records scr
				ON cp.internal_customer_id = scr.internal_id
			WHERE 1 = 1
				${customerProductEntityFilter}
				${statusFilter}
		),

		cus_entitlements AS (
			SELECT ce.*
			FROM customer_entitlements ce
			WHERE ce.customer_product_id IN (SELECT id FROM cus_products)
		),

		extra_cus_entitlements AS (
			SELECT ce.*
			FROM customer_entitlements ce
			JOIN subject_customer_records scr
				ON ce.internal_customer_id = scr.internal_id
			WHERE ce.customer_product_id IS NULL
				AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		all_cus_ent_ids AS (
			SELECT id FROM cus_entitlements
			UNION ALL
			SELECT id FROM extra_cus_entitlements
		),

		cus_rollovers AS (
			SELECT ro.*
			FROM rollovers ro
			WHERE ro.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
				AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		cus_prices AS (
			SELECT cpr.*
			FROM customer_prices cpr
			WHERE cpr.customer_product_id IN (SELECT id FROM cus_products)
		)

		${entityFragments.ctes}
		,

		distinct_products AS (
			SELECT DISTINCT ON (src.internal_customer_id, p.internal_id)
				src.internal_customer_id,
				p.*
			FROM products p
			JOIN (
				SELECT cp.internal_customer_id, cp.internal_product_id FROM cus_products cp
				${entityFragments.productRefsUnion}
			) src ON p.internal_id = src.internal_product_id
			ORDER BY src.internal_customer_id, p.internal_id
		),

		relevant_entitlement_records AS (
			SELECT DISTINCT
				ce.internal_customer_id,
				ce.entitlement_id
			FROM cus_entitlements ce
			UNION
			SELECT DISTINCT
				ece.internal_customer_id,
				ece.entitlement_id
			FROM extra_cus_entitlements ece
			${entityFragments.entitlementRefsUnion}
		),

		distinct_entitlements AS (
			SELECT
				rer.internal_customer_id,
				e.*,
				row_to_json(f) AS feature
			FROM relevant_entitlement_records rer
			JOIN entitlements e
				ON e.id = rer.entitlement_id
			JOIN features f
				ON e.internal_feature_id = f.internal_id
		),

		distinct_prices AS (
			SELECT DISTINCT ON (src.internal_customer_id, p.id)
				src.internal_customer_id,
				p.*
			FROM prices p
			JOIN (
				SELECT cpr.price_id, cp.internal_customer_id
				FROM cus_prices cpr
				JOIN cus_products cp ON cp.id = cpr.customer_product_id
				${entityFragments.priceRefsUnion}
			) src ON p.id = src.price_id
			ORDER BY src.internal_customer_id, p.id
		),

		distinct_free_trials AS (
			SELECT DISTINCT ON (src.internal_customer_id, ft.id)
				src.internal_customer_id,
				ft.*
			FROM free_trials ft
			JOIN (
				SELECT cp.free_trial_id, cp.internal_customer_id
				FROM cus_products cp
				WHERE cp.free_trial_id IS NOT NULL
				${entityFragments.freeTrialRefsUnion}
			) src ON ft.id = src.free_trial_id
			ORDER BY src.internal_customer_id, ft.id
		)

		SELECT
			row_to_json(scr) AS customer,

			COALESCE(
				(
					SELECT json_agg(row_to_json(cp))
					FROM cus_products cp
					WHERE cp.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_products,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ce))
					FROM cus_entitlements ce
					WHERE ce.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_entitlements,

			COALESCE(
				(
					SELECT json_agg(row_to_json(cpr))
					FROM cus_prices cpr
					JOIN cus_products cp
						ON cp.id = cpr.customer_product_id
					WHERE cp.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_prices,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ece))
					FROM extra_cus_entitlements ece
					WHERE ece.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS extra_customer_entitlements,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ro))
					FROM cus_rollovers ro
					WHERE ro.cus_ent_id IN (
						SELECT ce.id
						FROM cus_entitlements ce
						WHERE ce.internal_customer_id = scr.internal_id
						UNION ALL
						SELECT ece.id
						FROM extra_cus_entitlements ece
						WHERE ece.internal_customer_id = scr.internal_id
					)
				),
				'[]'::json
			) AS rollovers,

			COALESCE(
				(
					SELECT json_agg((row_to_json(p)::jsonb - 'internal_customer_id')::json)
					FROM distinct_products p
					WHERE p.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS products,

			COALESCE(
				(
					SELECT json_agg((row_to_json(ent)::jsonb - 'internal_customer_id')::json)
					FROM distinct_entitlements ent
					WHERE ent.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS entitlements,

			COALESCE(
				(
					SELECT json_agg((row_to_json(pr)::jsonb - 'internal_customer_id')::json)
					FROM distinct_prices pr
					WHERE pr.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS prices,

			COALESCE(
				(
					SELECT json_agg((row_to_json(ft)::jsonb - 'internal_customer_id')::json)
					FROM distinct_free_trials ft
					WHERE ft.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS free_trials

			${entityFragments.selectColumns}

		FROM subject_customer_records scr
		${subjectCustomerFilter}
	`;
};
