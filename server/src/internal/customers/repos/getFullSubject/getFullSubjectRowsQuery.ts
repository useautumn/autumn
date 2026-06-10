import { type CusProductStatus, RELEVANT_STATUSES } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { getEntityAggregateFragments } from "./getEntityAggregateFragments.js";

export const CUSTOMER_PRODUCT_LIMIT = 200;
export const EXTRA_CUSTOMER_ENTITLEMENT_LIMIT = 200;

const emptyEntityFragments = {
	ctes: sql``,
	productRefsUnion: sql``,
	entitlementRefsUnion: sql``,
	priceRefsUnion: sql``,
	freeTrialRefsUnion: sql``,
	selectColumns: sql``,
};

export const getFullSubjectRowsQuery = ({
	leadingCtes,
	inStatuses,
	includeInvoices,
	includeEntityAggregations,
	entityScopedOnly = false,
}: {
	leadingCtes: SQL;
	inStatuses: CusProductStatus[];
	includeInvoices: boolean;
	includeEntityAggregations: boolean;
	/** Only hydrate rows scoped to the subject's entity (requires non-null internal_entity_id on every subject). Customer-level rows must be merged back in separately. */
	entityScopedOnly?: boolean;
}) => {
	const statusFilter =
		inStatuses.length > 0
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;

	const relevantStatusFirst = sql`CASE WHEN cp.status = ANY(ARRAY[${sql.join(
		RELEVANT_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	)}]) THEN 0 ELSE 1 END`;

	const hasCustomerPrices = sql`EXISTS (
		SELECT 1
		FROM customer_prices cpr_exists
		WHERE cpr_exists.customer_product_id = cp.id
	)`;

	const entityFragments = includeEntityAggregations
		? getEntityAggregateFragments({
				statusFilter,
			})
		: emptyEntityFragments;

	const customerProductSubjectPredicate = entityScopedOnly
		? sql`cp.internal_entity_id = sr.internal_entity_id`
		: sql`cp.internal_customer_id = sr.internal_customer_id
					AND (
						(sr.internal_entity_id IS NULL AND cp.internal_entity_id IS NULL)
						OR
						(sr.internal_entity_id IS NOT NULL AND (
							cp.internal_entity_id IS NULL
							OR cp.internal_entity_id = sr.internal_entity_id
						))
					)`;

	const customerEntitlementSubjectPredicate = entityScopedOnly
		? sql`AND ce.internal_entity_id = sr.internal_entity_id`
		: sql`AND (
						(sr.internal_entity_id IS NULL AND ce.internal_entity_id IS NULL)
						OR
						(sr.internal_entity_id IS NOT NULL AND (
							ce.internal_entity_id IS NULL
							OR ce.internal_entity_id = sr.internal_entity_id
						))
					)`;

	const invoicesCte = includeInvoices
		? sql`,

		customer_invoices AS (
			SELECT *
			FROM invoices i
			WHERE i.internal_customer_id IN (
				SELECT internal_customer_id
				FROM subject_records
			)
			ORDER BY i.created_at DESC, i.id DESC
			LIMIT 10
		)`
		: sql``;

	const invoicesSelect = includeInvoices
		? sql`,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ci) ORDER BY ci.created_at DESC, ci.id DESC)
						FILTER (WHERE ci.id IS NOT NULL)
					FROM customer_invoices ci
					WHERE ci.internal_customer_id = sr.internal_customer_id
				),
				'[]'::json
			) AS invoices`
		: sql``;

	return sql`
		${leadingCtes}
		,

		subject_customer_records AS MATERIALIZED (
			SELECT DISTINCT c.*
			FROM customers c
			JOIN subject_records sr
				ON sr.internal_customer_id = c.internal_id
		),

		all_cus_products AS (
			SELECT
				cp_candidates.*,
				ROW_NUMBER() OVER (
					PARTITION BY cp_candidates.subject_key
					ORDER BY
						cp_candidates.subject_entity_priority ASC,
						cp_candidates.status_priority ASC,
						cp_candidates.has_customer_prices DESC,
						cp_candidates.product_is_add_on ASC,
						cp_candidates.created_at DESC
				) AS subject_rank
			FROM subject_records sr
			JOIN LATERAL (
				SELECT
					sr.subject_key,
					CASE
						WHEN sr.internal_entity_id IS NOT NULL
							AND cp.internal_entity_id = sr.internal_entity_id
						THEN 0
						ELSE 1
					END AS subject_entity_priority,
					${relevantStatusFirst} AS status_priority,
					${hasCustomerPrices} AS has_customer_prices,
					prod.is_add_on AS product_is_add_on,
					cp.*
				FROM customer_products cp
				JOIN products prod
					ON prod.internal_id = cp.internal_product_id
				WHERE ${customerProductSubjectPredicate}
					${statusFilter}
			) cp_candidates ON true
		),

		cus_products AS (
			SELECT *
			FROM all_cus_products
			WHERE subject_rank <= ${CUSTOMER_PRODUCT_LIMIT}
		),

		cus_entitlements AS (
			SELECT
				cp.subject_key,
				ce.*
			FROM customer_entitlements ce
			JOIN cus_products cp
				ON cp.id = ce.customer_product_id
		),

		extra_cus_entitlements AS (
			SELECT ce_ordered.*
			FROM subject_records sr
			JOIN LATERAL (
				SELECT
					sr.subject_key,
					CASE
						WHEN sr.internal_entity_id IS NOT NULL
							AND ce.internal_entity_id = sr.internal_entity_id
						THEN 0
						ELSE 1
					END AS subject_entity_priority,
					ce.*
				FROM customer_entitlements ce
				WHERE ce.internal_customer_id = sr.internal_customer_id
					AND ce.customer_product_id IS NULL
					AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
					AND (
						ce.balance != 0
						OR ce.unlimited IS TRUE
						OR EXISTS (
							SELECT 1
							FROM entitlements e
							JOIN features f ON f.internal_id = e.internal_feature_id
							WHERE e.id = ce.entitlement_id
								AND f.type = 'boolean'
						)
					)
					${customerEntitlementSubjectPredicate}
				ORDER BY subject_entity_priority ASC, ce.id DESC
				LIMIT ${EXTRA_CUSTOMER_ENTITLEMENT_LIMIT}
			) ce_ordered ON true
		),

		all_cus_ent_ids AS (
			SELECT subject_key, id FROM cus_entitlements
			UNION ALL
			SELECT subject_key, id FROM extra_cus_entitlements
		),

		cus_rollovers AS (
			SELECT ro.*
			FROM rollovers ro
			WHERE ro.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
				AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		cus_replaceables AS (
			SELECT rep.*
			FROM replaceables rep
			WHERE rep.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
		),

		cus_prices AS (
			SELECT
				cp.subject_key,
				cpr.*
			FROM customer_prices cpr
			JOIN cus_products cp
				ON cp.id = cpr.customer_product_id
		)

		${invoicesCte}
		${entityFragments.ctes}
		,

		distinct_products AS (
			SELECT DISTINCT ON (src.subject_key, p.internal_id)
				src.subject_key,
				src.internal_customer_id,
				p.*
			FROM products p
			JOIN (
				SELECT
					cp.subject_key,
					cp.internal_customer_id,
					cp.internal_product_id
				FROM cus_products cp
				${entityFragments.productRefsUnion}
			) src ON p.internal_id = src.internal_product_id
			ORDER BY src.subject_key, p.internal_id
		),

		relevant_entitlement_records AS (
			SELECT DISTINCT
				ce.subject_key,
				ce.internal_customer_id,
				ce.entitlement_id
			FROM cus_entitlements ce
			UNION
			SELECT DISTINCT
				ece.subject_key,
				ece.internal_customer_id,
				ece.entitlement_id
			FROM extra_cus_entitlements ece
			${entityFragments.entitlementRefsUnion}
		),

		distinct_entitlements AS (
			SELECT
				rer.subject_key,
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
			SELECT DISTINCT ON (src.subject_key, p.id)
				src.subject_key,
				src.internal_customer_id,
				p.*
			FROM prices p
			JOIN (
				SELECT
					cpr.subject_key,
					cpr.price_id,
					cp.internal_customer_id
				FROM cus_prices cpr
				JOIN cus_products cp ON cp.id = cpr.customer_product_id
					AND cp.subject_key = cpr.subject_key
				${entityFragments.priceRefsUnion}
			) src ON p.id = src.price_id
			ORDER BY src.subject_key, p.id
		),

		distinct_free_trials AS (
			SELECT DISTINCT ON (src.subject_key, ft.id)
				src.subject_key,
				src.internal_customer_id,
				ft.*
			FROM free_trials ft
			JOIN (
				SELECT
					cp.subject_key,
					cp.free_trial_id,
					cp.internal_customer_id
				FROM cus_products cp
				WHERE cp.free_trial_id IS NOT NULL
				${entityFragments.freeTrialRefsUnion}
			) src ON ft.id = src.free_trial_id
			ORDER BY src.subject_key, ft.id
		),

		cus_products_agg AS (
			SELECT
				cp.subject_key,
				json_agg(
					(
						row_to_json(cp)::jsonb
						- 'subject_key'
						- 'subject_entity_priority'
						- 'status_priority'
						- 'has_customer_prices'
						- 'product_is_add_on'
						- 'subject_rank'
					)::json
					ORDER BY
						cp.subject_entity_priority ASC,
						cp.status_priority ASC,
						cp.has_customer_prices DESC,
						cp.product_is_add_on ASC,
						cp.created_at DESC
				) AS items
			FROM cus_products cp
			GROUP BY cp.subject_key
		),

		cus_entitlements_agg AS (
			SELECT
				ce.subject_key,
				json_agg((row_to_json(ce)::jsonb - 'subject_key')::json) AS items
			FROM cus_entitlements ce
			GROUP BY ce.subject_key
		),

		cus_prices_agg AS (
			SELECT
				cpr.subject_key,
				json_agg((row_to_json(cpr)::jsonb - 'subject_key')::json) AS items
			FROM cus_prices cpr
			GROUP BY cpr.subject_key
		),

		extra_cus_entitlements_agg AS (
			SELECT
				ece.subject_key,
				json_agg(
					(
						row_to_json(ece)::jsonb
						- 'subject_key'
						- 'subject_entity_priority'
					)::json
					ORDER BY ece.subject_entity_priority ASC, ece.id DESC
				) AS items
			FROM extra_cus_entitlements ece
			GROUP BY ece.subject_key
		),

		replaceables_agg AS (
			SELECT
				ace.subject_key,
				json_agg(row_to_json(rep) ORDER BY rep.created_at ASC, rep.id ASC) AS items
			FROM cus_replaceables rep
			JOIN all_cus_ent_ids ace
				ON ace.id = rep.cus_ent_id
			GROUP BY ace.subject_key
		),

		rollovers_agg AS (
			SELECT
				ace.subject_key,
				json_agg(
					row_to_json(ro)
					ORDER BY ro.expires_at ASC NULLS LAST, ro.id ASC
				) AS items
			FROM cus_rollovers ro
			JOIN all_cus_ent_ids ace
				ON ace.id = ro.cus_ent_id
			GROUP BY ace.subject_key
		),

		products_agg AS (
			SELECT
				p.subject_key,
				json_agg(
					(row_to_json(p)::jsonb - 'internal_customer_id' - 'subject_key')::json
					ORDER BY p.internal_id
				) AS items
			FROM distinct_products p
			GROUP BY p.subject_key
		),

		entitlements_agg AS (
			SELECT
				ent.subject_key,
				json_agg((row_to_json(ent)::jsonb - 'internal_customer_id' - 'subject_key')::json) AS items
			FROM distinct_entitlements ent
			GROUP BY ent.subject_key
		),

		prices_agg AS (
			SELECT
				pr.subject_key,
				json_agg(
					(row_to_json(pr)::jsonb - 'internal_customer_id' - 'subject_key')::json
					ORDER BY pr.id
				) AS items
			FROM distinct_prices pr
			GROUP BY pr.subject_key
		),

		free_trials_agg AS (
			SELECT
				ft.subject_key,
				json_agg(
					(row_to_json(ft)::jsonb - 'internal_customer_id' - 'subject_key')::json
					ORDER BY ft.id
				) AS items
			FROM distinct_free_trials ft
			GROUP BY ft.subject_key
		),

		subscriptions_agg AS (
			SELECT
				cs.subject_key,
				json_agg(row_to_json(cs.subscription_row))
					FILTER (WHERE (cs.subscription_row).stripe_id IS NOT NULL) AS items
			FROM (
				SELECT DISTINCT
					cp.subject_key,
					s AS subscription_row
				FROM cus_products cp
				JOIN LATERAL unnest(cp.subscription_ids) AS cp_sub(stripe_id) ON true
				JOIN subscriptions s
					ON s.stripe_id = cp_sub.stripe_id
			) cs
			GROUP BY cs.subject_key
		)

		SELECT
			row_to_json(scr) AS customer,
			COALESCE(cus_products_agg.items, '[]'::json) AS customer_products,
			COALESCE(cus_entitlements_agg.items, '[]'::json) AS customer_entitlements,
			COALESCE(cus_prices_agg.items, '[]'::json) AS customer_prices,
			COALESCE(extra_cus_entitlements_agg.items, '[]'::json) AS extra_customer_entitlements,
			COALESCE(replaceables_agg.items, '[]'::json) AS replaceables,
			COALESCE(rollovers_agg.items, '[]'::json) AS rollovers,
			COALESCE(products_agg.items, '[]'::json) AS products,
			COALESCE(entitlements_agg.items, '[]'::json) AS entitlements,
			COALESCE(prices_agg.items, '[]'::json) AS prices,
			COALESCE(free_trials_agg.items, '[]'::json) AS free_trials,
			COALESCE(subscriptions_agg.items, '[]'::json) AS subscriptions

			${invoicesSelect},

			CASE
				WHEN er.internal_id IS NULL THEN NULL
				ELSE row_to_json(er)
			END AS entity
			${entityFragments.selectColumns}

		FROM subject_records sr
		JOIN subject_customer_records scr
			ON scr.internal_id = sr.internal_customer_id
		LEFT JOIN cus_products_agg ON cus_products_agg.subject_key = sr.subject_key
		LEFT JOIN cus_entitlements_agg ON cus_entitlements_agg.subject_key = sr.subject_key
		LEFT JOIN cus_prices_agg ON cus_prices_agg.subject_key = sr.subject_key
		LEFT JOIN extra_cus_entitlements_agg ON extra_cus_entitlements_agg.subject_key = sr.subject_key
		LEFT JOIN replaceables_agg ON replaceables_agg.subject_key = sr.subject_key
		LEFT JOIN rollovers_agg ON rollovers_agg.subject_key = sr.subject_key
		LEFT JOIN products_agg ON products_agg.subject_key = sr.subject_key
		LEFT JOIN entitlements_agg ON entitlements_agg.subject_key = sr.subject_key
		LEFT JOIN prices_agg ON prices_agg.subject_key = sr.subject_key
		LEFT JOIN free_trials_agg ON free_trials_agg.subject_key = sr.subject_key
		LEFT JOIN subscriptions_agg ON subscriptions_agg.subject_key = sr.subject_key
		LEFT JOIN entities er
			ON er.internal_id = sr.internal_entity_id
		ORDER BY sr.subject_order
	`;
};
