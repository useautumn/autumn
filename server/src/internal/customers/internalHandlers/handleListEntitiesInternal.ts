import { type Entity, Scopes, entities } from "@autumn/shared";
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
			.from(sql`customers`)
			.where(
				and(
					or(
						eq(sql`id`, customer_id),
						eq(sql`internal_id`, customer_id),
					),
					eq(sql`org_id`, ctx.org.id),
					eq(sql`env`, ctx.env),
				),
			)
			.limit(1);

		if (internalCustomerResult.length === 0) {
			return c.json({ list: [], total: 0 });
		}

		const internalCustomerId = internalCustomerResult[0].internal_id;

		const baseConditions = and(
			eq(entities.internal_customer_id, internalCustomerId),
			eq(entities.deleted, false),
		);

		const searchCondition = search
			? and(
					baseConditions,
					or(
						ilike(entities.id, `%${search}%`),
						ilike(entities.name, `%${search}%`),
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
				.where(baseConditions),
		]);

		return c.json({
			list: results as Entity[],
			total: results.length,
			total_count: countResult[0]?.count ?? 0,
		});
	},
});
