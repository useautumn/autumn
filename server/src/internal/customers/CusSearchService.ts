import {
	type AppEnv,
	CusProductStatus,
	type CustomerListFilters,
	customerProducts,
	customers,
} from "@autumn/shared";

import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type DashboardIntervalFilter,
	type DashboardProductVersionFilter,
	isCustomDashboardProductFilter,
	parseDashboardIntervalFilter,
	parseDashboardVersionFilter,
} from "./getFullCusQuery.js";

const dashboardProductFilterToRawSql = ({
	filter,
	orgId,
	env,
}: {
	filter: DashboardProductVersionFilter;
	orgId: string;
	env: AppEnv;
}) =>
	isCustomDashboardProductFilter(filter)
		? sql`(${customerProducts.product_id} = ${filter.productId} AND ${customerProducts.is_custom} = true)`
		: sql`(${customerProducts.internal_product_id} IN (
				SELECT p_lookup.internal_id
				FROM products p_lookup
				WHERE p_lookup.org_id = ${orgId}
					AND p_lookup.env = ${env}
					AND p_lookup.id = ${filter.productId}
					AND p_lookup.version = ${filter.version}
			))`;

const dashboardIntervalFilterToRawSql = (
	intervals: DashboardIntervalFilter[],
) =>
	sql`EXISTS (
		SELECT 1
		FROM customer_prices cpr_interval
		JOIN prices p_interval ON p_interval.id = cpr_interval.price_id
		WHERE cpr_interval.customer_product_id = ${customerProducts.id}
			AND p_interval.config->>'interval' = ANY(ARRAY[${sql.join(
				intervals.map((interval) => sql`${interval}`),
				sql`, `,
			)}])
	)`;

type SearchFilters = CustomerListFilters;

export class CusSearchService {
	/** node-postgres returns int8 counts as strings, so every return coerces. */
	static async count({
		db,
		orgId,
		env,
		search,
		filters,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		search: string;
		filters?: SearchFilters;
	}): Promise<{ totalCount: number }> {
		const predicates = buildSearchPredicates({ orgId, env, search, filters });

		const rows = await db.execute<{ count: number | string }>(sql`
			SELECT count(*) AS count
			FROM ${customers}
			WHERE ${predicates.whereRaw}
			${planetScaleTag({ query: "countCustomersForSearch" })}
		`);
		return { totalCount: Number(rows[0]?.count ?? 0) };
	}

	static async resolveInternalIdsByCursor({
		db,
		orgId,
		env,
		search,
		filters,
		cursor,
		limit,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		search: string;
		filters?: SearchFilters;
		cursor?: { t: number; id: string } | null;
		limit: number;
	}): Promise<{
		internalIds: string[];
		peek: { t: number; id: string } | null;
	}> {
		const predicates = buildSearchPredicates({ orgId, env, search, filters });
		const fetchLimit = limit + 1;
		const cursorClause = cursor
			? sql`AND (${customers.created_at}, ${customers.id}) < (${cursor.t}, ${cursor.id})`
			: sql``;

		const rows = (await db.execute(sql`
			SELECT ${customers.internal_id} AS internal_id,
			       ${customers.created_at} AS created_at,
			       ${customers.id} AS id
			FROM ${customers}
			WHERE ${predicates.whereRaw}
			${cursorClause}
			ORDER BY ${customers.created_at} DESC, ${customers.id} DESC
			LIMIT ${fetchLimit}
			${planetScaleTag({
				query:
					predicates.kind === "productMode"
						? "searchCustomersByProductMode"
						: "searchCustomersByProduct",
			})}
		`)) as unknown as Array<{
			internal_id: string;
			created_at: number;
			id: string;
		}>;
		return splitWithPeek(rows, limit);
	}
}

export type CustomerSearchPredicates = {
	kind: "default" | "noneMode" | "productMode";
	whereRaw: SQL;
};

/**
 * Shared by the dashboard list, count, and the CSV export walk. Every mode
 * drives from customers so the keyset index orders the scan; product-level
 * filters become EXISTS semi-joins probed per customer.
 */
export const buildSearchPredicates = ({
	orgId,
	env,
	search,
	filters,
}: {
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: SearchFilters;
}): CustomerSearchPredicates => {
	const baseRaw = sql.join(
		[
			sql`${customers.org_id} = ${orgId}`,
			sql`${customers.env} = ${env}`,
			search
				? sql`(${customers.id} ILIKE ${`%${search}%`} OR ${customers.name} ILIKE ${`%${search}%`} OR ${customers.email} ILIKE ${`%${search}%`})`
				: null,
			filters?.processor?.length
				? sql`(${sql.join(
						filters.processor
							.map((proc) => {
								if (proc === "stripe")
									return sql`(${customers.processor}->>'id' IS NOT NULL)`;
								if (proc === "revenuecat")
									return sql`EXISTS (SELECT 1 FROM customer_products cp_p WHERE cp_p.internal_customer_id = ${customers.internal_id} AND cp_p.processor->>'type' = 'revenuecat')`;
								if (proc === "vercel")
									return sql`(${customers.processors}->>'vercel' IS NOT NULL)`;
								return null;
							})
							.filter((c): c is NonNullable<typeof c> => c !== null),
						sql` OR `,
					)})`
				: null,
		].filter((c): c is NonNullable<typeof c> => c !== null),
		sql` AND `,
	);

	if (filters?.none) {
		return {
			kind: "noneMode",
			whereRaw: sql`${baseRaw} AND NOT EXISTS (
				SELECT 1 FROM customer_products ncp
				WHERE ncp.internal_customer_id = ${customers.internal_id}
					AND ncp.status IN (${CusProductStatus.Active}, ${CusProductStatus.PastDue}, ${CusProductStatus.Scheduled})
			)`,
		};
	}

	const statuses =
		filters?.status && filters.status.length > 0 && !filters.status.includes("")
			? filters.status
			: [];
	const productVersionFilters = parseDashboardVersionFilter(filters?.version);
	const intervalFilters = parseDashboardIntervalFilter(filters?.interval);

	const hasProductLevelFilter =
		statuses.length > 0 ||
		productVersionFilters.length > 0 ||
		intervalFilters.length > 0;

	if (!hasProductLevelFilter) {
		return { kind: "default", whereRaw: baseRaw };
	}

	const activeProdRaw = sql`(${customerProducts.status} = ${CusProductStatus.Active} OR ${customerProducts.status} = ${CusProductStatus.PastDue})`;

	const statusRaw =
		statuses.length > 0
			? sql`(${sql.join(
					statuses.map((status) => {
						switch (status) {
							case "active":
								return sql`(${customerProducts.status} = ${CusProductStatus.Active} AND ${customerProducts.canceled_at} IS NULL)`;
							case "past_due":
								return sql`(${customerProducts.status} = ${CusProductStatus.PastDue} AND ${customerProducts.canceled_at} IS NULL)`;
							case "canceled":
								return sql`(${customerProducts.canceled_at} IS NOT NULL AND ${activeProdRaw})`;
							case "free_trial":
								return sql`(${customerProducts.trial_ends_at} > ${Date.now()} AND ${customerProducts.free_trial_id} IS NOT NULL AND ${customerProducts.canceled_at} IS NULL AND ${activeProdRaw})`;
							case CusProductStatus.Expired:
								return sql`(${customerProducts.status} = ${CusProductStatus.Expired} AND ${customerProducts.canceled_at} IS NULL AND NOT EXISTS (
									SELECT 1 FROM customer_products cp_alias
									WHERE cp_alias.internal_customer_id = ${customerProducts.internal_customer_id}
									  AND cp_alias.product_id = ${customerProducts.product_id}
									  AND (cp_alias.status = ${CusProductStatus.Active} OR cp_alias.status = ${CusProductStatus.PastDue})
								))`;
							default:
								return sql`${customerProducts.status} = ${status}`;
						}
					}),
					sql` OR `,
				)})`
			: null;

	const versionRaw =
		productVersionFilters.length > 0
			? sql`(${sql.join(
					productVersionFilters.map((filter) =>
						dashboardProductFilterToRawSql({ filter, orgId, env }),
					),
					sql` OR `,
				)})`
			: null;

	const intervalRaw =
		intervalFilters.length > 0
			? dashboardIntervalFilterToRawSql(intervalFilters)
			: null;

	const hasNonActiveStatus = statuses.some(
		(status) => status !== "active" && status !== "",
	);
	const shouldApplyActiveFilter =
		statuses.length === 0 ||
		(statuses.includes("active") && !hasNonActiveStatus);

	const productClauses = [
		shouldApplyActiveFilter ? activeProdRaw : null,
		statusRaw,
		versionRaw,
		intervalRaw,
	].filter((c): c is NonNullable<typeof c> => c !== null);

	return {
		kind: "productMode",
		whereRaw: sql`${baseRaw} AND EXISTS (
			SELECT 1
			FROM ${customerProducts}
			WHERE ${customerProducts.internal_customer_id} = ${customers.internal_id}
				AND ${sql.join(productClauses, sql` AND `)}
		)`,
	};
};

const splitWithPeek = (
	rows: Array<{ internal_id: string; created_at: number; id: string }>,
	limit: number,
): { internalIds: string[]; peek: { t: number; id: string } | null } => {
	if (rows.length > limit) {
		const page = rows.slice(0, limit);
		const peekRow = rows[limit]!;
		return {
			internalIds: page.map((r) => r.internal_id),
			peek: { t: Number(peekRow.created_at), id: peekRow.id },
		};
	}
	return {
		internalIds: rows.map((r) => r.internal_id),
		peek: null,
	};
};
