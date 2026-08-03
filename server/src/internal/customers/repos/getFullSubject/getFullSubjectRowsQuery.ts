import {
	ACTIVE_STATUSES,
	type CusProductStatus,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import { notLicenseAssignmentSql } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import { composeCustomerLicensesCtes } from "./composeCustomerLicensesCtes.js";
import { getEntityAggregateFragments } from "./getEntityAggregateFragments.js";

export const CUSTOMER_PRODUCT_LIMIT = 200;
export const EXTRA_CUSTOMER_ENTITLEMENT_LIMIT = 200;

/**
 * Every aggregate and `distinct_*` CTE below is declared `AS MATERIALIZED`.
 *
 * Postgres inlines a CTE referenced once, which is normally the better plan. But
 * the row estimate for the subject set collapses to 1 — the planner multiplies
 * org_id/internal_customer_id/env as independent conditions and clamps — while a
 * multi-subject page (entities.list) really returns up to 1,000. So each
 * `LEFT JOIN xxx_agg ON subject_key` was planned as a nested loop and the inlined
 * aggregate re-ran once per output row, re-sorting its whole input each time to
 * keep one group. Measured on mintlify's 12,212-entity customer: 28,450ms, of
 * which cus_products_agg alone was 18,025ms across 1,001 loops.
 *
 * MATERIALIZED forces one evaluation into a tuplestore, so the estimate stops
 * mattering. Same customer: 839ms. There is nothing to push down into these
 * (they are already scoped by subject_records), so the usual cost of blocking
 * predicate pushdown does not apply, and the single-subject getFullSubject path
 * measured neutral — 585ms vs 570ms, byte-identical output.
 */
/** Per-subject aggregate CTE → key in the subject object. Each exposes (subject_key, items). */
const SUBJECT_AGGREGATES = [
	{ cte: "cus_products_agg", column: "customer_products" },
	{ cte: "cus_entitlements_agg", column: "customer_entitlements" },
	{ cte: "cus_prices_agg", column: "customer_prices" },
	{ cte: "customer_licenses_agg", column: "customer_licenses" },
	{ cte: "extra_cus_entitlements_agg", column: "extra_customer_entitlements" },
	{ cte: "replaceables_agg", column: "replaceables" },
	{ cte: "rollovers_agg", column: "rollovers" },
	{ cte: "usage_windows_agg", column: "usage_windows" },
	{ cte: "subscriptions_agg", column: "subscriptions" },
] as const;

/** Org catalog. Identical for every subject, so these are built once per page
 *  and returned once alongside the subject array, never per subject. */
const CATALOG_AGGREGATES = [
	{ cte: "products_agg", column: "products" },
	{ cte: "entitlements_agg", column: "entitlements" },
	{ cte: "prices_agg", column: "prices" },
	{ cte: "free_trials_agg", column: "free_trials" },
] as const;

const subjectAggregateKeyValues = sql.join(
	SUBJECT_AGGREGATES.map(({ cte, column }) =>
		sql.raw(`'${column}', COALESCE(${cte}.items, '[]'::json)`),
	),
	sql`,
				`,
);

const subjectAggregateJoins = sql.join(
	SUBJECT_AGGREGATES.map(({ cte }) =>
		sql.raw(`LEFT JOIN ${cte} ON ${cte}.subject_key = sr.subject_key`),
	),
	sql`
		`,
);

const catalogKeyValues = sql.join(
	CATALOG_AGGREGATES.map(({ cte, column }) =>
		sql.raw(
			`'${column}', COALESCE((SELECT items FROM ${cte}), '[]'::json)`,
		),
	),
	sql`,
			`,
);

const emptyEntityFragments = {
	ctes: sql``,
	productRefsUnion: sql``,
	entitlementRefsUnion: sql``,
	priceRefsUnion: sql``,
	freeTrialRefsUnion: sql``,
	selectKeyValue: sql``,
};

export const getFullSubjectRowsQuery = ({
	leadingCtes,
	inStatuses,
	includeInvoices,
	includeEntityAggregations,
	entityScopedOnly = false,
	queryTag = "getFullSubject",
}: {
	leadingCtes: SQL;
	inStatuses: CusProductStatus[];
	includeInvoices: boolean;
	includeEntityAggregations: boolean;
	/** Only hydrate rows scoped to the subject's entity (requires non-null internal_entity_id on every subject). Customer-level rows must be merged back in separately. */
	entityScopedOnly?: boolean;
	queryTag?: string;
}) => {
	const entityAggregationStatuses =
		inStatuses.length > 0
			? ACTIVE_STATUSES.filter((status) => inStatuses.includes(status))
			: ACTIVE_STATUSES;
	// Status lists bind as a single array parameter rather than one placeholder
	// per element. This keeps the generated SQL text identical regardless of how
	// many statuses a caller passes, which is what lets the statement be reused
	// as a named prepared statement instead of re-planned on every execution.
	const entityAggregationStatusFilter =
		entityAggregationStatuses.length > 0
			? sql`AND cp.status = ANY(${sql.param(entityAggregationStatuses)}::text[])`
			: sql`AND FALSE`;

	// Seats own no lifecycle: their raw status column lags until the seat-sync
	// cron converges it, so the candidate filter/rank must check the pool
	// parent's LIVE status (via pcp_early) instead of cp.status for those rows.
	const effectiveStatusFilter =
		inStatuses.length > 0
			? sql`AND COALESCE(pcp_early.status, cp.status) = ANY(${sql.param(inStatuses)}::text[])`
			: sql``;

	const effectiveRelevantStatusFirst = sql`CASE WHEN COALESCE(pcp_early.status, cp.status) = ANY(${sql.param(RELEVANT_STATUSES)}::text[]) THEN 0 ELSE 1 END`;

	const hasCustomerPrices = sql`EXISTS (
		SELECT 1
		FROM customer_prices cpr_exists
		WHERE cpr_exists.customer_product_id = cp.id
	)`;

	const entityFragments = includeEntityAggregations
		? getEntityAggregateFragments({
				statusFilter: entityAggregationStatusFilter,
			})
		: emptyEntityFragments;
	const customerLevelProductPredicate = sql`
		cp.internal_entity_id IS NULL
		AND ${sql.raw(notLicenseAssignmentSql("cp"))}`;

	const customerProductSubjectPredicate = entityScopedOnly
		? sql`cp.internal_entity_id = sr.internal_entity_id`
		: sql`cp.internal_customer_id = sr.internal_customer_id
					AND (
						(sr.internal_entity_id IS NULL AND ${customerLevelProductPredicate})
						OR
						(sr.internal_entity_id IS NOT NULL AND (
							${customerLevelProductPredicate}
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

	const invoicesKeyValue = includeInvoices
		? sql`,

			'invoices', COALESCE(
				(
					SELECT json_agg(row_to_json(ci) ORDER BY ci.created_at DESC, ci.id DESC)
						FILTER (WHERE ci.id IS NOT NULL)
					FROM customer_invoices ci
					WHERE ci.internal_customer_id = sr.internal_customer_id
				),
				'[]'::json
			)`
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
					${effectiveRelevantStatusFirst} AS status_priority,
					${hasCustomerPrices} AS has_customer_prices,
					prod.is_add_on AS product_is_add_on,
					-- Resolved once here and carried through cus_products so the
					-- aggregate below doesn't repeat this LATERAL + join.
					CASE WHEN pcl_early.id IS NULL THEN NULL ELSE to_jsonb(pcl_early) END
						AS parent_customer_license,
					CASE WHEN pcp_early.id IS NULL THEN NULL ELSE jsonb_build_object(
						'status', pcp_early.status,
						'subscription_ids', to_jsonb(pcp_early.subscription_ids),
						'canceled_at', pcp_early.canceled_at
					) END AS parent_customer_product,
					cp.*
				FROM customer_products cp
				JOIN products prod
					ON prod.internal_id = cp.internal_product_id
				-- Seats own no lifecycle: the raw status column lags until the
				-- seat-sync cron converges it, so the filter/rank below must
				-- resolve the pool parent's LIVE status, not cp.status.
				LEFT JOIN LATERAL (
					SELECT pool.*
					FROM customer_licenses pool
					JOIN customer_products pool_parent
						ON pool_parent.id = pool.parent_customer_product_id
					WHERE cp.customer_license_link_id IS NOT NULL
						AND pool.link_id = cp.customer_license_link_id
					ORDER BY (pool_parent.status IN ('active', 'past_due', 'scheduled')) DESC,
						pool.created_at DESC
					LIMIT 1
				) pcl_early ON true
				LEFT JOIN customer_products pcp_early
					ON pcp_early.id = pcl_early.parent_customer_product_id
				WHERE ${customerProductSubjectPredicate}
					${effectiveStatusFilter}
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
			WHERE ce.pooled_balance_id IS NULL
				AND ce.pooled_contribution_id IS NULL
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
					ce.*,
					NULL::json AS pooled_balance
				FROM customer_entitlements ce
				WHERE ce.internal_customer_id = sr.internal_customer_id
					AND ce.customer_product_id IS NULL
					AND ce.pooled_balance_id IS NULL
					AND ce.pooled_contribution_id IS NULL
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

		pooled_customer_entitlements AS (
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
					ce.*,
					row_to_json(pb) AS pooled_balance
				FROM customer_entitlements ce
				JOIN pooled_balances pb
					ON pb.id = ce.pooled_balance_id
				WHERE ce.internal_customer_id = sr.internal_customer_id
					AND ce.customer_product_id IS NULL
					AND ce.pooled_balance_id IS NOT NULL
					AND ce.pooled_contribution_id IS NULL
					AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
					${customerEntitlementSubjectPredicate}
				ORDER BY subject_entity_priority ASC, ce.id DESC
				LIMIT ${EXTRA_CUSTOMER_ENTITLEMENT_LIMIT}
			) ce_ordered ON true
		),

		all_cus_ent_ids AS (
			SELECT subject_key, id FROM cus_entitlements
			UNION ALL
			SELECT subject_key, id FROM extra_cus_entitlements
			UNION ALL
			SELECT subject_key, id FROM pooled_customer_entitlements
		),

		cus_rollovers AS (
			SELECT ro.*
			FROM rollovers ro
			WHERE ro.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
				AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		cus_usage_windows AS (
			SELECT uw.*
			FROM usage_windows uw
			WHERE uw.internal_customer_id IN (
				SELECT internal_customer_id FROM subject_records
			)
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
		),

		${composeCustomerLicensesCtes()}

		${invoicesCte}
		${entityFragments.ctes}
		,

		distinct_products AS MATERIALIZED (
			SELECT DISTINCT ON (p.internal_id)
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
			ORDER BY p.internal_id
		),

		relevant_entitlement_records AS MATERIALIZED (
			SELECT DISTINCT rer_src.entitlement_id
			FROM (
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
				UNION
				SELECT DISTINCT
					pce.subject_key,
					pce.internal_customer_id,
					pce.entitlement_id
				FROM pooled_customer_entitlements pce
				${entityFragments.entitlementRefsUnion}
			) rer_src
		),

		distinct_entitlements AS MATERIALIZED (
			SELECT
				e.*,
				row_to_json(f) AS feature
			FROM relevant_entitlement_records rer
			JOIN entitlements e
				ON e.id = rer.entitlement_id
			JOIN features f
				ON e.internal_feature_id = f.internal_id
		),

		distinct_prices AS MATERIALIZED (
			SELECT DISTINCT ON (p.id)
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
			ORDER BY p.id
		),

		distinct_free_trials AS MATERIALIZED (
			SELECT DISTINCT ON (ft.id)
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
			ORDER BY ft.id
		),

		cus_products_agg AS MATERIALIZED (
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
						-- parent_customer_license / parent_customer_product ride along
						-- from all_cus_products (seat rows carry their pool and the
						-- parent's unfiltered lifecycle snapshot), so they land in this
						-- object via row_to_json. They used to be re-derived here by a
						-- second copy of the same LATERAL + join.
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

		cus_entitlements_agg AS MATERIALIZED (
			SELECT
				ce.subject_key,
				json_agg((row_to_json(ce)::jsonb - 'subject_key')::json) AS items
			FROM cus_entitlements ce
			GROUP BY ce.subject_key
		),

		cus_prices_agg AS MATERIALIZED (
			SELECT
				cpr.subject_key,
				json_agg((row_to_json(cpr)::jsonb - 'subject_key')::json) AS items
			FROM cus_prices cpr
			GROUP BY cpr.subject_key
		),

		extra_cus_entitlements_agg AS MATERIALIZED (
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
			FROM (
				SELECT * FROM extra_cus_entitlements
				UNION ALL
				SELECT * FROM pooled_customer_entitlements
			) ece
			GROUP BY ece.subject_key
		),

		replaceables_agg AS MATERIALIZED (
			SELECT
				ace.subject_key,
				json_agg(row_to_json(rep) ORDER BY rep.created_at ASC, rep.id ASC) AS items
			FROM cus_replaceables rep
			JOIN all_cus_ent_ids ace
				ON ace.id = rep.cus_ent_id
			GROUP BY ace.subject_key
		),

		rollovers_agg AS MATERIALIZED (
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

		usage_windows_agg AS MATERIALIZED (
			SELECT
				sr.subject_key,
				json_agg(
					row_to_json(uw)
					ORDER BY uw.window_start_at ASC, uw.id ASC
				) AS items
			FROM subject_records sr
			JOIN cus_usage_windows uw
				ON uw.internal_customer_id = sr.internal_customer_id
			GROUP BY sr.subject_key
		),

		products_agg AS MATERIALIZED (
			SELECT json_agg(row_to_json(p) ORDER BY p.internal_id) AS items
			FROM distinct_products p
		),

		entitlements_agg AS MATERIALIZED (
			SELECT json_agg(row_to_json(ent) ORDER BY ent.id) AS items
			FROM distinct_entitlements ent
		),

		prices_agg AS MATERIALIZED (
			SELECT json_agg(row_to_json(pr) ORDER BY pr.id) AS items
			FROM distinct_prices pr
		),

		free_trials_agg AS MATERIALIZED (
			SELECT json_agg(row_to_json(ft) ORDER BY ft.id) AS items
			FROM distinct_free_trials ft
		),

		subscriptions_agg AS MATERIALIZED (
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
		),

		subject_rows AS (
			SELECT
				sr.subject_order,
				json_build_object(
					'customer', row_to_json(scr),
					${subjectAggregateKeyValues}
					${invoicesKeyValue},

					'entity', CASE
						WHEN er.internal_id IS NULL THEN NULL
						ELSE row_to_json(er)
					END
					${entityFragments.selectKeyValue}
				) AS subject
			FROM subject_records sr
			JOIN subject_customer_records scr
				ON scr.internal_id = sr.internal_customer_id
			${subjectAggregateJoins}
			LEFT JOIN entities er
				ON er.internal_id = sr.internal_entity_id
		)

		SELECT json_build_object(
			'subjects', COALESCE(
				(
					SELECT json_agg(s.subject ORDER BY s.subject_order)
					FROM subject_rows s
				),
				'[]'::json
			),
			${catalogKeyValues}
		) AS result
		${planetScaleTag({ query: queryTag })}
	`;
};
