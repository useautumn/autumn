import {
	type AppEnv,
	CusProductStatus,
	customerProducts,
	customers,
	products,
} from "@autumn/shared";

import {
	and,
	desc,
	eq,
	gt, ilike, isNotNull,
	isNull,
	lt,
	notExists,
	or,
	sql
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";

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
};

const productFields = {
	internal_id: products.internal_id,
	id: products.id,
	name: products.name,
	version: products.version,
};

interface SearchFilters {
	status?: string[];
	version?: string[];
	none?: string;
}

export class CusSearchService {
	static async searchByProduct({
		db,
		orgId,
		env,
		search,
		filters,
		pageSize = 50,
		pageNumber,
		// lastItem,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		search: string;
		filters: SearchFilters;
		pageSize?: number;
		pageNumber: number;
		// lastItem?: {
		//   internal_id: string;
		//   created_at?: string;
		//   name?: string;
		// } | null;
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

		// Handle product:version combinations
		let productVersionFilters: Array<{ productId: string; version: number }> =
			[];

		// Parse version field which now contains "productId:version,productId2:version2"
		if (filters.version && filters.version.length > 0) {
			const versionSelections = filters.version.filter(Boolean);
			productVersionFilters = versionSelections.map((selection) => {
				const [productId, version] = selection.split(":");
				return { productId, version: parseInt(version) };
			});
		}

		const filtersDrizzle = and(
			// New product:version filtering
			productVersionFilters.length > 0
				? or(
						...productVersionFilters.map((pv) =>
							and(
								eq(customerProducts.product_id, pv.productId),
								eq(products.version, pv.version),
							),
						),
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
								case "canceled":
									return and(
										isNotNull(customerProducts.canceled_at),
										activeProdFilter,
									);
								case "free_trial":
									return and(
										gt(customerProducts.trial_ends_at, Date.now()),
										isNotNull(customerProducts.free_trial_id),
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
				.orderBy(desc(customers.internal_id))
				.offset(offset)
				.limit(pageSize);
		} else {
			// Use cursor-based pagination
			productQueryResult = buildQuery()
				.where(whereClause)
				.orderBy(desc(customers.internal_id))
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

		const processedData = Array.from(customerMap.values());

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
					),
				),
		]);

		return { data: results, count: totalCountResult[0]?.count || 0 };
	}

	static async search({
		db,
		orgId,
		env,
		search,
		pageSize = 50,
		filters,
		lastItem,
		pageNumber,
	}: {
		db: DrizzleCli;
		orgId: string;
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
		const noneProducts = filters?.none === "true";

		if (noneProducts) {
			return await CusSearchService.searchByNone({
				db,
				orgId,
				env,
				search,
				filters,
				pageSize,
				// lastItem: resolvedLastItem,
				pageNumber,
			});
		}

		if (filters?.version && filters?.version.length > 0) {
			return await CusSearchService.searchByProduct({
				db,
				orgId,
				env,
				search,
				filters,
				pageSize,
				// lastItem: resolvedLastItem,
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
				.orderBy(desc(baseQuery.internal_id)),
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

		const finalResults = Array.from(customerMap.values());

		return { data: finalResults, count: totalCount };
	}
}

// // Legacy support for product_id field (if still used)
// let productIds: string[] = [];
// if (filters.product_id) {
//   if (filters.product_id.includes(",")) {
//     productIds = filters.product_id.split(",").filter(Boolean);
//   } else {
//     productIds = [filters.product_id];
//   }
// }
