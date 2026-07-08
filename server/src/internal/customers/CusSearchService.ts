import {
	type AppEnv,
	CusProductStatus,
	RELEVANT_STATUSES,
	customerProducts,
	customers,
	products,
} from "@autumn/shared";

import {
	and,
	asc,
	desc,
	eq,
	gt,
	ilike,
	isNotNull,
	isNull,
	lt,
	notExists,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getOrgCusProductLimit } from "../misc/edgeConfig/orgLimitsStore.js";
import type { CustomerListFilters } from "./customerListFilters.js";
import {
	type DashboardIntervalFilter,
	type DashboardProductVersionFilter,
	isCustomDashboardProductFilter,
	isVersionDashboardProductFilter,
	parseDashboardIntervalFilter,
	parseDashboardVersionFilter,
} from "./getFullCusQuery.js";

// Create alias for subquery
const customerProductsAlias = alias(customerProducts, "cp_alias");

const customerFields = {
	internal_id: customers.internal_id,
	id: customers.id,
	name: customers.name,
	email: customers.email,
	created_at: customers.created_at,
};

const customerProductFields = {
	id: customerProducts.id,
	internal_product_id: customerProducts.internal_product_id,
	product_id: customerProducts.product_id,
	canceled_at: customerProducts.canceled_at,
	status: customerProducts.status,
	trial_ends_at: customerProducts.trial_ends_at,
	created_at: customerProducts.created_at,
};

const productFields = {
	internal_id: products.internal_id,
	id: products.id,
	name: products.name,
	version: products.version,
	is_add_on: products.is_add_on,
};

const dashboardProductFilterToDrizzleSql = (
	filter: DashboardProductVersionFilter,
) =>
	and(
		isCustomDashboardProductFilter(filter)
			? and(
					eq(customerProducts.product_id, filter.productId),
					eq(customerProducts.is_custom, true),
				)
			: and(eq(products.id, filter.productId), eq(products.version, filter.version)),
	);

const dashboardProductFilterToRawSql = (
	filter: DashboardProductVersionFilter,
) =>
	isCustomDashboardProductFilter(filter)
		? sql`(${customerProducts.product_id} = ${filter.productId} AND ${customerProducts.is_custom} = true)`
		: sql`(${products.id} = ${filter.productId} AND ${products.version} = ${filter.version})`;

const dashboardIntervalFilterToRawSql = (intervals: DashboardIntervalFilter[]) =>
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
	static getProcessorFilterSql({
		customerTableAlias = customers,
	}: {
		customerTableAlias?: typeof customers;
	}) {
		return ({ proc }: { proc: string }) => {
			if (proc === "stripe") {
				return sql`(${customerTableAlias.processor}->>'id' IS NOT NULL)`;
			}

			if (proc === "revenuecat") {
				return sql`EXISTS (
					SELECT 1
					FROM customer_products cp_processor
					WHERE cp_processor.internal_customer_id = ${customerTableAlias.internal_id}
						AND cp_processor.processor->>'type' = 'revenuecat'
				)`;
			}

			if (proc === "vercel") {
				return sql`(${customerTableAlias.processors}->>'vercel' IS NOT NULL)`;
			}

			return undefined;
		};
	}

	static async searchByProduct({
		db,
		orgId,
		orgSlug,
		env,
		search,
		filters,
		pageSize = 50,
		pageNumber,
	}: {
		db: DrizzleCli;
		orgId: string;
		orgSlug?: string;
		env: AppEnv;
		search: string;
		filters: SearchFilters;
		pageSize?: number;
		pageNumber: number;
	}) {
		// If we have a lastItem with only internal_id, fetch the full customer data for cursor pagination
		// let resolvedLastItem = lastItem;
		// if (lastItem && lastItem.internal_id && !lastItem.created_at) {
		//   const customerData = await db
		//     .select({
		//       internal_id: customers.internal_id,
		//       created_at: customers.created_at,
		//       name: customers.name,
		//     })
		//     .from(customers)
		//     .where(
		//       and(
		//         eq(customers.internal_id, lastItem.internal_id),
		//         eq(customers.org_id, orgId),
		//         eq(customers.env, env)
		//       )
		//     )
		//     .limit(1);

		//   if (customerData.length > 0) {
		//     resolvedLastItem = {
		//       internal_id: customerData[0].internal_id,
		//       created_at: customerData[0].created_at as any,
		//       name: customerData[0].name || "",
		//     };
		//   } else {
		//     // If customer not found, reset to no lastItem
		//     resolvedLastItem = null;
		//   }
		// }

		let statuses: string[] = [];

		// 1. Create base query to fetch all customerproducts
		const activeProdFilter = or(
			eq(customerProducts.status, CusProductStatus.Active),
			eq(customerProducts.status, CusProductStatus.PastDue),
		);

		if (filters.status && filters.status.length > 0) {
			statuses = filters.status;
		} else {
			statuses = [];
		}

		const productVersionFilters = parseDashboardVersionFilter(filters.version);

		const filtersDrizzle = and(
			// New product:version filtering
			productVersionFilters.length > 0
				? or(
						...productVersionFilters.map(dashboardProductFilterToDrizzleSql),
					)
				: undefined,
			// Legacy product filtering (fallback)
			// productIds.length > 0 && productVersionFilters.length === 0
			//   ? inArray(customerProducts.product_id, productIds)
			//   : undefined,
			statuses.length > 0 && !statuses.includes("")
				? or(
						...statuses.map((status) => {
							switch (status) {
								case "active":
									return and(
										eq(customerProducts.status, CusProductStatus.Active),
										isNull(customerProducts.canceled_at),
									);
								case "past_due":
									return and(
										eq(customerProducts.status, CusProductStatus.PastDue),
										isNull(customerProducts.canceled_at),
									);
								case "canceled":
									return and(
										isNotNull(customerProducts.canceled_at),
										activeProdFilter,
									);
								case "free_trial":
									return and(
										gt(customerProducts.trial_ends_at, Date.now()),
										isNotNull(customerProducts.free_trial_id),
										isNull(customerProducts.canceled_at),
										activeProdFilter,
									);
								case CusProductStatus.Expired:
									return and(
										eq(customerProducts.status, CusProductStatus.Expired),
										isNull(customerProducts.canceled_at),
										notExists(
											db
												.select()
												.from(customerProductsAlias)
												.where(
													and(
														eq(
															customerProductsAlias.internal_customer_id,
															customerProducts.internal_customer_id,
														),
														eq(
															customerProductsAlias.product_id,
															customerProducts.product_id,
														),
														or(
															eq(
																customerProductsAlias.status,
																CusProductStatus.Active,
															),
															eq(
																customerProductsAlias.status,
																CusProductStatus.PastDue,
															),
														),
													),
												),
										),
									);
								default:
									return eq(customerProducts.status, status);
							}
						}),
					)
				: undefined,
		);

		const cusFilter = and(
			eq(customers.org_id, orgId),
			eq(customers.env, env),

			search
				? or(
						ilike(customers.id, `%${search}%`),
						ilike(customers.name, `%${search}%`),
						ilike(customers.email, `%${search}%`),
					)
				: undefined,

			filters.processor?.length
				? or(
						...filters.processor
							.map((proc) =>
								CusSearchService.getProcessorFilterSql({})({ proc }),
							)
							.filter((c): c is NonNullable<typeof c> => c !== undefined),
					)
				: undefined,
		);

		// Build the where clause
		// Apply active filter by default, unless user has selected non-active statuses
		const hasStatusFilters = statuses.length > 0 && !statuses.includes("");
		const hasNonActiveStatusFilters =
			hasStatusFilters &&
			statuses.some((status) => status !== "active" && status !== "");
		const shouldApplyActiveFilter =
			!hasStatusFilters ||
			(statuses.includes("active") && !hasNonActiveStatusFilters);

		const whereClause = and(
			shouldApplyActiveFilter ? activeProdFilter : undefined,
			filtersDrizzle,
			cusFilter,
			// resolvedLastItem && resolvedLastItem.internal_id
			//   ? lt(customers.internal_id, resolvedLastItem.internal_id)
			//   : undefined
		);

		// Execute query with appropriate pagination
		const hasProductFilters = productVersionFilters.length > 0;

		// Build the query based on pagination type
		const buildQuery = () => {
			const baseQuery = db
				.select({
					customer: customerFields,
					customerProduct: customerProductFields,
					product: productFields,
				})
				.from(customerProducts)
				.leftJoin(
					customers,
					eq(customerProducts.internal_customer_id, customers.internal_id),
				);

			if (hasProductFilters) {
				return baseQuery.innerJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				);
			} else {
				return baseQuery.leftJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				);
			}
		};

		let productQueryResult;
		if (pageNumber > 1) {
			// Use offset-based pagination
			const offset = (pageNumber - 1) * pageSize;
			productQueryResult = buildQuery()
				.where(whereClause)
				.orderBy(desc(customers.internal_id), asc(products.is_add_on))
				.offset(offset)
				.limit(pageSize);
		} else {
			// Use cursor-based pagination
			productQueryResult = buildQuery()
				.where(whereClause)
				.orderBy(desc(customers.internal_id), asc(products.is_add_on))
				.limit(pageSize);
		}

		// Build count query with same join logic
		const buildCountQuery = () => {
			const baseCountQuery = db
				.select({
					totalCount: sql<number>`count(distinct ${customers.internal_id})`.as(
						"total_count",
					),
				})
				.from(customerProducts)
				.leftJoin(
					customers,
					eq(customerProducts.internal_customer_id, customers.internal_id),
				);

			if (hasProductFilters) {
				return baseCountQuery.innerJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				);
			} else {
				return baseCountQuery.leftJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				);
			}
		};

		const [results, totalCountResult] = await Promise.all([
			productQueryResult,
			buildCountQuery().where(
				and(
					shouldApplyActiveFilter ? activeProdFilter : undefined,
					filtersDrizzle,
					cusFilter,
				),
			),
		]);

		// Process the results to group customer products by customer
		const customerMap = new Map();

		for (const row of results) {
			const customerId = row.customer?.internal_id;
			if (!customerId) continue;

			if (!customerMap.has(customerId)) {
				customerMap.set(customerId, {
					...row.customer,
					customer_products: [],
				});
			}

			if (row.customerProduct) {
				customerMap.get(customerId).customer_products.push({
					...row.customerProduct,
					product: row.product,
				});
			}
		}

		const cusProductLimit = getOrgCusProductLimit({ orgId, orgSlug });
		const processedData = Array.from(customerMap.values());
		for (const customer of processedData) {
			customer.customer_products = sortRelevantFirst(
				customer.customer_products,
			).slice(0, cusProductLimit);
		}

		const totalCount = totalCountResult[0]?.totalCount || 0;

		return { data: processedData, count: totalCount };
	}

	static async searchByNone({
		db,
		orgId,
		env,
		search,
		filters,
		pageSize = 50,
		pageNumber,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		search: string;
		filters: SearchFilters;
		pageSize?: number;
		pageNumber: number;
	}) {
		const noneFilter = notExists(
			db
				.select()
				.from(customerProducts)
				.where(
					and(
						eq(customerProducts.internal_customer_id, customers.internal_id),
						or(
							eq(customerProducts.status, CusProductStatus.Active),
							eq(customerProducts.status, CusProductStatus.PastDue),
							eq(customerProducts.status, CusProductStatus.Scheduled),
						),
					),
				),
		);

		const baseWhereClause = and(
			eq(customers.org_id, orgId),
			eq(customers.env, env),
			search
				? or(
						ilike(customers.id, `%${search}%`),
						ilike(customers.name, `%${search}%`),
						ilike(customers.email, `%${search}%`),
					)
				: undefined,
			noneFilter,
			filters?.processor?.length
				? or(
						...filters.processor
							.map((proc) =>
								CusSearchService.getProcessorFilterSql({})({ proc }),
							)
							.filter((c): c is NonNullable<typeof c> => c !== undefined),
					)
				: undefined,
		);

		let baseQuery;
		if (pageNumber > 1) {
			// Use offset-based pagination
			const offset = (pageNumber - 1) * pageSize;
			baseQuery = db
				.select(customerFields)
				.from(customers)
				.where(baseWhereClause)
				.orderBy(desc(customers.internal_id))
				.offset(offset)
				.limit(pageSize);
		} else {
			// Use cursor-based pagination
			baseQuery = db
				.select(customerFields)
				.from(customers)
				.where(baseWhereClause)
				.orderBy(desc(customers.internal_id))
				.limit(pageSize);
		}

		const [results, totalCountResult] = await Promise.all([
			baseQuery,
			db
				.select({
					count: sql<number>`count(*)`.as("count"),
				})
				.from(customers)
				.where(
					and(
						eq(customers.org_id, orgId),
						eq(customers.env, env),
						search
							? or(
									ilike(customers.id, `%${search}%`),
									ilike(customers.name, `%${search}%`),
									ilike(customers.email, `%${search}%`),
								)
							: undefined,
						noneFilter,
						filters?.processor?.length
							? or(
									...filters.processor
										.map((proc) => {
											if (proc === "stripe")
												return sql`(${customers.processor}->>'id' IS NOT NULL)`;
											if (proc === "revenuecat")
												return sql`(${customers.processors}->>'revenuecat' IS NOT NULL)`;
											if (proc === "vercel")
												return sql`(${customers.processors}->>'vercel' IS NOT NULL)`;
											return undefined;
										})
										.filter((c): c is NonNullable<typeof c> => c !== undefined),
								)
							: undefined,
					),
				),
		]);

		return { data: results, count: totalCountResult[0]?.count || 0 };
	}

	static async search({
		db,
		orgId,
		orgSlug,
		env,
		search,
		pageSize = 50,
		filters,
		lastItem,
		pageNumber,
	}: {
		db: DrizzleCli;
		orgId: string;
		orgSlug?: string;
		env: AppEnv;
		search: string;
		lastItem?: {
			internal_id: string;
			created_at?: string;
			name?: string;
		} | null;
		filters?: SearchFilters;
		pageSize?: number;
		pageNumber: number;
	}) {
		// If we have a lastItem with only internal_id, fetch the full customer data for cursor pagination
		let resolvedLastItem = lastItem;
		if (lastItem && lastItem.internal_id && !lastItem.created_at) {
			const customerData = await db
				.select({
					internal_id: customers.internal_id,
					created_at: customers.created_at,
					name: customers.name,
				})
				.from(customers)
				.where(
					and(
						eq(customers.internal_id, lastItem.internal_id),
						eq(customers.org_id, orgId),
						eq(customers.env, env),
					),
				)
				.limit(1);

			if (customerData.length > 0) {
				resolvedLastItem = {
					internal_id: customerData[0].internal_id,
					created_at: customerData[0].created_at as any,
					name: customerData[0].name || "",
				};
			} else {
				// If customer not found, reset to no lastItem (will show page 1)
				resolvedLastItem = null;
			}
		}
		const noneProducts = !!filters?.none;

		if (noneProducts) {
			return await CusSearchService.searchByNone({
				db,
				orgId,
				env,
				search,
				filters,
				pageSize,
				pageNumber,
			});
		}

		// Call searchByProduct if we have version filters OR status filters
		if (
			(filters?.version && filters?.version.length > 0) ||
			(filters?.status && filters?.status.length > 0)
		) {
			return await CusSearchService.searchByProduct({
				db,
				orgId,
				orgSlug,
				env,
				search,
				filters,
				pageSize,
				pageNumber,
			});
		}

		const filterClause = and(
			eq(customers.org_id, orgId),
			eq(customers.env, env),
			search
				? or(
						ilike(customers.id, `%${search}%`),
						ilike(customers.name, `%${search}%`),
						ilike(customers.email, `%${search}%`),
					)
				: undefined,
			filters?.processor?.length
				? or(
						...filters.processor
							.map((proc) =>
								CusSearchService.getProcessorFilterSql({})({ proc }),
							)
							.filter((c): c is NonNullable<typeof c> => c !== undefined),
					)
				: undefined,
		);

		// Build the where clause for base query
		const baseWhereClause = and(
			filterClause,
			resolvedLastItem && resolvedLastItem.internal_id
				? lt(customers.internal_id, resolvedLastItem.internal_id)
				: undefined,
		);

		// Create the base customer query as a subquery with appropriate pagination
		let baseQuery;
		if (!resolvedLastItem && pageNumber > 1) {
			// Use offset-based pagination
			const offset = (pageNumber - 1) * pageSize;
			baseQuery = db
				.select(customerFields)
				.from(customers)
				.where(baseWhereClause)
				.orderBy(desc(customers.internal_id))
				.offset(offset)
				.limit(pageSize)
				.as("baseQuery");
		} else {
			// Use cursor-based pagination
			baseQuery = db
				.select(customerFields)
				.from(customers)
				.where(baseWhereClause)
				.orderBy(desc(customers.internal_id))
				.limit(pageSize)
				.as("baseQuery");
		}

		// Get total count in parallel without pagination
		const totalCountQuery = db
			.select({
				count: sql<number>`count(*)`.as("count"),
			})
			.from(customers)
			.where(filterClause);

		// Now join with customer products and products
		const [results, totalCountResult] = await Promise.all([
			db
				.select({
					// Customer fields
					customer: {
						internal_id: baseQuery.internal_id,
						id: baseQuery.id,
						name: baseQuery.name,
						email: baseQuery.email,
						created_at: baseQuery.created_at,
					},
					// Customer product fields
					customerProduct: customerProductFields,
					// Product fields
					product: productFields,
				})
				.from(baseQuery)
				.leftJoin(
					customerProducts,
					eq(baseQuery.internal_id, customerProducts.internal_customer_id),
				)
				.leftJoin(
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				)
				.orderBy(desc(baseQuery.internal_id), asc(products.is_add_on)),
			totalCountQuery,
		]);

		if (results.length === 0) {
			return { data: [], count: 0 };
		}

		const totalCount = totalCountResult[0]?.count || 0;

		// Group the results by customer
		const customerMap = new Map();

		for (const row of results) {
			const customerId = row.customer.internal_id;

			if (!customerMap.has(customerId)) {
				customerMap.set(customerId, {
					...row.customer,
					created_at: Number(row.customer.created_at),
					customer_products: [],
				});
			}

			// Add customer product if it exists
			if (row.customerProduct && row.customerProduct.id) {
				customerMap.get(customerId).customer_products.push({
					...row.customerProduct,
					product: row.product,
				});
			}
		}

		const cusProductLimit = getOrgCusProductLimit({ orgId, orgSlug });
		const finalResults = Array.from(customerMap.values());
		for (const customer of finalResults) {
			customer.customer_products = sortRelevantFirst(
				customer.customer_products,
			).slice(0, cusProductLimit);
		}

		return { data: finalResults, count: totalCount };
	}

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

		if (predicates.kind === "noneMode") {
			const rows = await db
				.select({ count: sql<number>`count(*)`.as("count") })
				.from(customers)
				.where(predicates.where);
			return { totalCount: rows[0]?.count ?? 0 };
		}

		if (predicates.kind === "productMode") {
			const rows = await db
				.select({
					count: sql<number>`count(distinct ${customers.internal_id})`.as(
						"count",
					),
				})
				.from(customerProducts)
				.leftJoin(
					customers,
					eq(customerProducts.internal_customer_id, customers.internal_id),
				)
				[predicates.useInnerJoin ? "innerJoin" : "leftJoin"](
					products,
					eq(customerProducts.internal_product_id, products.internal_id),
				)
				.where(predicates.where);
			return { totalCount: rows[0]?.count ?? 0 };
		}

		const rows = await db
			.select({ count: sql<number>`count(*)`.as("count") })
			.from(customers)
			.where(predicates.where);
		return { totalCount: rows[0]?.count ?? 0 };
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

		if (predicates.kind === "productMode") {
			const rows = (await db.execute(sql`
				SELECT DISTINCT ${customers.internal_id} AS internal_id,
				                ${customers.created_at} AS created_at,
				                ${customers.id} AS id
				FROM ${customerProducts}
				${
					predicates.useInnerJoin
						? sql`INNER JOIN ${products} ON ${customerProducts.internal_product_id} = ${products.internal_id}`
						: sql`LEFT JOIN ${products} ON ${customerProducts.internal_product_id} = ${products.internal_id}`
				}
				LEFT JOIN ${customers} ON ${customerProducts.internal_customer_id} = ${customers.internal_id}
				WHERE ${predicates.whereRaw}
				${cursorClause}
				ORDER BY ${customers.created_at} DESC, ${customers.id} DESC
				LIMIT ${fetchLimit}
				${planetScaleTag({ query: "searchCustomersByProductMode" })}
			`)) as unknown as Array<{
				internal_id: string;
				created_at: number;
				id: string;
			}>;
			return splitWithPeek(rows, limit);
		}

		const rows = (await db.execute(sql`
			SELECT ${customers.internal_id} AS internal_id,
			       ${customers.created_at} AS created_at,
			       ${customers.id} AS id
			FROM ${customers}
			WHERE ${predicates.whereRaw}
			${cursorClause}
			ORDER BY ${customers.created_at} DESC, ${customers.id} DESC
			LIMIT ${fetchLimit}
			${planetScaleTag({ query: "searchCustomersByProduct" })}
		`)) as unknown as Array<{
			internal_id: string;
			created_at: number;
			id: string;
		}>;
		return splitWithPeek(rows, limit);
	}
}

type Predicates =
	| {
			kind: "noneMode";
			where: ReturnType<typeof and>;
			whereRaw: ReturnType<typeof sql>;
	  }
	| {
			kind: "productMode";
			where: ReturnType<typeof and>;
			whereRaw: ReturnType<typeof sql>;
			useInnerJoin: boolean;
	  }
	| {
			kind: "default";
			where: ReturnType<typeof and>;
			whereRaw: ReturnType<typeof sql>;
	  };

const buildSearchPredicates = ({
	orgId,
	env,
	search,
	filters,
}: {
	orgId: string;
	env: AppEnv;
	search: string;
	filters?: SearchFilters;
}): Predicates => {
	const cusBaseClauses = [
		eq(customers.org_id, orgId),
		eq(customers.env, env),
		search
			? or(
					ilike(customers.id, `%${search}%`),
					ilike(customers.name, `%${search}%`),
					ilike(customers.email, `%${search}%`),
				)
			: undefined,
		filters?.processor?.length
			? or(
					...filters.processor
						.map((proc) => CusSearchService.getProcessorFilterSql({})({ proc }))
						.filter((c): c is NonNullable<typeof c> => c !== undefined),
				)
			: undefined,
	];

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
		const noneFilter = notExists(
			sql`SELECT 1 FROM customer_products ncp
				WHERE ncp.internal_customer_id = ${customers.internal_id}
					AND ncp.status IN (${CusProductStatus.Active}, ${CusProductStatus.PastDue}, ${CusProductStatus.Scheduled})`,
		);
		return {
			kind: "noneMode",
			where: and(...cusBaseClauses, noneFilter),
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
	const hasNumberedVersion = productVersionFilters.some(
		isVersionDashboardProductFilter,
	);
	const intervalFilters = parseDashboardIntervalFilter(filters?.interval);

	const hasProductLevelFilter =
		statuses.length > 0 ||
		productVersionFilters.length > 0 ||
		intervalFilters.length > 0;

	if (!hasProductLevelFilter) {
		return {
			kind: "default",
			where: and(...cusBaseClauses),
			whereRaw: baseRaw,
		};
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
					productVersionFilters.map(dashboardProductFilterToRawSql),
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

	const whereRaw =
		productClauses.length > 0
			? sql`${baseRaw} AND ${sql.join(productClauses, sql` AND `)}`
			: baseRaw;

	const activeDrizzle = or(
		eq(customerProducts.status, CusProductStatus.Active),
		eq(customerProducts.status, CusProductStatus.PastDue),
	);
	const filtersDrizzle = and(
		productVersionFilters.length > 0
			? or(
					...productVersionFilters.map(dashboardProductFilterToDrizzleSql),
				)
			: undefined,
		intervalFilters.length > 0
			? dashboardIntervalFilterToRawSql(intervalFilters)
			: undefined,
		statuses.length > 0
			? or(
					...statuses.map((status) => {
						switch (status) {
							case "active":
								return and(
									eq(customerProducts.status, CusProductStatus.Active),
									isNull(customerProducts.canceled_at),
								);
							case "past_due":
								return and(
									eq(customerProducts.status, CusProductStatus.PastDue),
									isNull(customerProducts.canceled_at),
								);
							case "canceled":
								return and(
									isNotNull(customerProducts.canceled_at),
									activeDrizzle,
								);
							case "free_trial":
								return and(
									gt(customerProducts.trial_ends_at, Date.now()),
									isNotNull(customerProducts.free_trial_id),
									isNull(customerProducts.canceled_at),
									activeDrizzle,
								);
							case CusProductStatus.Expired:
								return and(
									eq(customerProducts.status, CusProductStatus.Expired),
									isNull(customerProducts.canceled_at),
									sql`NOT EXISTS (
										SELECT 1 FROM customer_products cp_alias
										WHERE cp_alias.internal_customer_id = ${customerProducts.internal_customer_id}
										  AND cp_alias.product_id = ${customerProducts.product_id}
										  AND (cp_alias.status = ${CusProductStatus.Active} OR cp_alias.status = ${CusProductStatus.PastDue})
									)`,
								);
							default:
								return eq(customerProducts.status, status);
						}
					}),
				)
			: undefined,
	);

	return {
		kind: "productMode",
		useInnerJoin: hasNumberedVersion,
		where: and(
			shouldApplyActiveFilter ? activeDrizzle : undefined,
			filtersDrizzle,
			...cusBaseClauses,
		),
		whereRaw,
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

const sortRelevantFirst = (
	customerProducts: Array<{
		status?: string;
		created_at?: string | number;
		product?: { is_add_on?: boolean; name?: string | null };
	}>,
) => {
	return customerProducts.sort((a, b) => {
		const isRelevant = (status?: string) =>
			RELEVANT_STATUSES.includes(status as CusProductStatus) ||
			status === CusProductStatus.Trialing;
		const aRelevant = isRelevant(a.status) ? 0 : 1;
		const bRelevant = isRelevant(b.status) ? 0 : 1;
		if (aRelevant !== bRelevant) return aRelevant - bRelevant;

		const aAddOn = a.product?.is_add_on ? 1 : 0;
		const bAddOn = b.product?.is_add_on ? 1 : 0;
		if (aAddOn !== bAddOn) return aAddOn - bAddOn;

		const aName = (a.product?.name ?? "").toLowerCase();
		const bName = (b.product?.name ?? "").toLowerCase();
		if (aName !== bName) return aName.localeCompare(bName);

		return Number(b.created_at ?? 0) - Number(a.created_at ?? 0);
	});
};
// // Legacy support for product_id field (if still used)
// let productIds: string[] = [];
// if (filters.product_id) {
//   if (filters.product_id.includes(",")) {
//     productIds = filters.product_id.split(",").filter(Boolean);
//   } else {
//     productIds = [filters.product_id];
//   }
// }
