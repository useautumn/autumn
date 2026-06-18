import {
	ACTIVE_STATUSES,
	type AppEnv,
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	type CusProductStatus,
	type ListCustomersV2Params,
	RELEVANT_STATUSES,
	type StandardCursorFields,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	cpStatusInClause,
	customerProductsSeedCte,
	customerProductsSeedSelect,
} from "./getCustomerProductsPageQuery.js";
import {
	type DashboardProductVersionFilter,
	type DashboardStatusFilter,
	getCustomerListFilterSql,
} from "./getFullCusQuery.js";

export type CursorPaginatedFullCusQueryArgs = {
	orgId: string;
	env: AppEnv;
	inStatuses?: CusProductStatus[];
	withSubs?: boolean;
	withEntities?: boolean;
	includeInvoices?: boolean;
	entitiesLimit?: number;
	invoicesLimit?: number;
	limit: number;
	cursor?: StandardCursorFields;
	internalCustomerIds?: string[];
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	search?: string;
	statusFilters?: DashboardStatusFilter[];
	noneFilter?: boolean;
	productVersionFilters?: DashboardProductVersionFilter[];
	cusProductLimit: number;
	customerId?: string;
};

/**
 * Set-based variant: customer_products/entitlements/prices fetched via single
 * hash joins instead of per-customer LATERAL nested loops. Top-N per customer
 * is enforced by a ROW_NUMBER() window over the joined cps.
 */
export const getCursorPaginatedFullCusQuery = ({
	orgId,
	env,
	inStatuses,
	withSubs = true,
	withEntities = false,
	includeInvoices = false,
	entitiesLimit = 300,
	invoicesLimit = 10,
	limit,
	cursor,
	internalCustomerIds,
	plans,
	processors,
	search,
	statusFilters,
	noneFilter,
	productVersionFilters,
	cusProductLimit,
	customerId,
}: CursorPaginatedFullCusQueryArgs) => {
	const cpStatusFilter = cpStatusInClause(inStatuses);

	const productsSeedCte = customerProductsSeedCte({
		inStatuses: RELEVANT_STATUSES,
		limit: CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	});

	const customerListFilterSql = getCustomerListFilterSql({
		internalCustomerIds,
		orgId,
		env,
		inStatuses,
		plans,
		processors,
		search,
		statusFilters,
		noneFilter,
		productVersionFilters,
	});

	const cursorPredicate = cursor
		? sql`AND (c.created_at, c.id) < (${cursor.t}, ${cursor.id})`
		: sql``;

	const fetchLimit = limit + 1;

	const subscriptionsSelect = withSubs
		? sql`(
				SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
				FROM (
					SELECT DISTINCT s.*
					FROM cps_ranked cps
					CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
					JOIN subscriptions s ON s.stripe_id = sub_id_t.sub_id
					WHERE cps.subscription_ids IS NOT NULL
				) s
			) AS subscriptions`
		: sql`'[]'::json AS subscriptions`;

	const entitiesCte = withEntities
		? sql`, entities_all AS MATERIALIZED (
				SELECT e.internal_customer_id, row_to_json(e) AS row_json
				FROM cr
				JOIN LATERAL (
					SELECT e.*
					FROM entities e
					WHERE e.internal_customer_id = cr.internal_id
					ORDER BY e.internal_id DESC
					LIMIT ${entitiesLimit}
				) e ON true
			)`
		: sql``;

	const invoicesCte = includeInvoices
		? sql`, invoices_all AS MATERIALIZED (
				SELECT i.internal_customer_id, row_to_json(i) AS row_json
				FROM cr
				JOIN LATERAL (
					SELECT i.*
					FROM invoices i
					WHERE i.internal_customer_id = cr.internal_id
					ORDER BY i.created_at DESC, i.id DESC
					LIMIT ${invoicesLimit}
				) i ON true
			)`
		: sql``;

	const entitiesSelect = withEntities
		? sql`, (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM entities_all) AS entities`
		: sql``;

	const invoicesSelect = includeInvoices
		? sql`, (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM invoices_all) AS invoices`
		: sql``;

	return sql`
		WITH cr AS MATERIALIZED (
			SELECT
				c.internal_id,
				c.id,
				c.created_at,
				row_to_json(c) AS row_json
		FROM customers c
		WHERE c.org_id = ${orgId}
			AND c.env = ${env}
			${customerId ? sql`AND (c.id = ${customerId} OR c.internal_id = ${customerId})` : sql`${customerListFilterSql}${cursorPredicate}`}
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT ${fetchLimit}
		),
		cp_ranked_raw AS MATERIALIZED (
			SELECT
				cp.id,
				cp.internal_customer_id,
				cp.internal_product_id,
				cp.free_trial_id,
				cp.subscription_ids,
				cp.status,
				cp.created_at,
				row_to_json(cp) AS cp_json,
				prod.is_add_on AS prod_is_add_on,
				row_to_json(prod) AS prod_json,
				ROW_NUMBER() OVER (
					PARTITION BY cp.internal_customer_id
					ORDER BY prod.is_add_on ASC, cp.created_at DESC
				) AS rn
			FROM cr
			JOIN customer_products cp ON cp.internal_customer_id = cr.internal_id
			JOIN products prod ON prod.internal_id = cp.internal_product_id
			WHERE TRUE ${cpStatusFilter}
		),
		cps_ranked AS MATERIALIZED (
			SELECT
				cp.id,
				cp.internal_customer_id,
				cp.internal_product_id,
				cp.free_trial_id,
				cp.subscription_ids,
				(cp.cp_json::jsonb || jsonb_build_object('product', cp.prod_json::jsonb))::json AS row_json
			FROM cp_ranked_raw cp
			WHERE cp.rn <= ${cusProductLimit}
		),
		cp_counts AS MATERIALIZED (
			SELECT internal_customer_id, COUNT(*)::int AS n
			FROM cp_ranked_raw
			WHERE status = ANY(ARRAY[${sql.join(
				ACTIVE_STATUSES.map((status) => sql`${status}`),
				sql`, `,
			)}])
			GROUP BY internal_customer_id
		),
		ces_bound AS MATERIALIZED (
			SELECT ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
			FROM cps_ranked
			JOIN customer_entitlements ce ON ce.customer_product_id = cps_ranked.id
		),
		ces_loose AS MATERIALIZED (
			SELECT ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
			FROM cr
			JOIN LATERAL (
				SELECT ce.*
				FROM customer_entitlements ce
				WHERE ce.internal_customer_id = cr.internal_id
					AND ce.customer_product_id IS NULL
					AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
				ORDER BY ce.id DESC
				LIMIT 30
			) ce ON true
		),
		ces_all AS MATERIALIZED (
			SELECT id, entitlement_id FROM ces_bound
			UNION ALL
			SELECT id, entitlement_id FROM ces_loose
		),
		${productsSeedCte}
		${entitiesCte}
		${invoicesCte}
		SELECT
			(SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cr) AS customers,
			(SELECT COALESCE(json_object_agg(internal_customer_id, n), '{}'::json) FROM cp_counts) AS product_counts,
			${customerProductsSeedSelect},
			(SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cps_ranked) AS customer_products,
			(SELECT COALESCE(json_agg(row_json), '[]'::json) FROM ces_bound) AS customer_entitlements,
			(SELECT COALESCE(json_agg(row_json ORDER BY id DESC), '[]'::json) FROM ces_loose) AS extra_customer_entitlements,
			(SELECT COALESCE(json_agg(row_to_json(cpr)::jsonb || jsonb_build_object('price', row_to_json(p))), '[]'::json)
				FROM cps_ranked
				JOIN customer_prices cpr ON cpr.customer_product_id = cps_ranked.id
				LEFT JOIN prices p ON p.id = cpr.price_id
			) AS customer_prices,
			(SELECT COALESCE(json_agg(row_to_json(e)::jsonb || jsonb_build_object('feature', row_to_json(f))), '[]'::json)
				FROM (SELECT DISTINCT entitlement_id FROM ces_all) ce
				JOIN entitlements e ON e.id = ce.entitlement_id
				JOIN features f ON f.internal_id = e.internal_feature_id
			) AS entitlements,
			(SELECT COALESCE(json_agg(row_to_json(ro)), '[]'::json)
				FROM ces_all
				JOIN rollovers ro ON ro.cus_ent_id = ces_all.id
				WHERE ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000
			) AS rollovers,
			(SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
				FROM ces_all
				JOIN replaceables r ON r.cus_ent_id = ces_all.id
			) AS replaceables,
			(SELECT COALESCE(json_agg(row_to_json(ft)), '[]'::json)
				FROM (SELECT DISTINCT free_trial_id FROM cps_ranked WHERE free_trial_id IS NOT NULL) cps
				JOIN free_trials ft ON ft.id = cps.free_trial_id
			) AS free_trials,
			${subscriptionsSelect}
			${entitiesSelect}
			${invoicesSelect}
	`;
};
