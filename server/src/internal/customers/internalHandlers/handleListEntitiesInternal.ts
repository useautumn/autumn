import { customers, type Entity, entities, Scopes } from "@autumn/shared";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const DEFAULT_LIMIT = 50;

export const handleListEntitiesInternal = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();
		const search = c.req.query("search")?.trim();
		const limit = Number(c.req.query("limit")) || DEFAULT_LIMIT;

		const internalCustomerResult = await ctx.db
			.select({ internal_id: sql<string>`internal_id` })
			.from(customers)
			.where(
				and(
					or(
						eq(customers.id, customer_id),
						eq(customers.internal_id, customer_id),
					),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			)
			.limit(1);

		if (internalCustomerResult.length === 0) {
			return c.json({ list: [], total_count: 0 });
		}

		const internalCustomerId = internalCustomerResult[0].internal_id;

		const baseConditions = and(
			eq(entities.internal_customer_id, internalCustomerId),
			eq(entities.deleted, false),
		);

		const escapedSearch = search?.replace(/[%_\\]/g, "\\$&");
		const searchCondition = escapedSearch
			? and(
					baseConditions,
					or(
						ilike(entities.id, `%${escapedSearch}%`),
						ilike(entities.name, `%${escapedSearch}%`),
					),
				)
			: baseConditions;

		const [results, countResult] = await Promise.all([
			ctx.db
				.select()
				.from(entities)
				.where(searchCondition)
				.orderBy(sql`created_at DESC`)
				.limit(limit),
			ctx.db
				.select({ count: sql<number>`count(*)::int` })
				.from(entities)
				.where(searchCondition),
		]);

		return c.json({
			list: results as Entity[],
			total_count: countResult[0]?.count ?? 0,
		});
	},
});
