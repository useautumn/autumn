import { customers, Scopes } from "@autumn/shared";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

const SEARCH_LIMIT = 20;

/** Customers of one org whose id, name or email contains the search, across both envs. */
export const handleSearchAdminOrgCustomers = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ org_id: z.string().min(1) }),
	query: z.object({ search: z.string().trim().min(1) }),
	handler: async (c) => {
		const { db } = c.get("ctx");
		const { org_id: orgId } = c.req.param();
		const { search } = c.req.valid("query");
		const pattern = `%${search}%`;

		const rows = await db
			.select({
				id: customers.id,
				name: customers.name,
				email: customers.email,
				env: customers.env,
			})
			.from(customers)
			.where(
				and(
					eq(customers.org_id, orgId),
					or(
						ilike(customers.id, pattern),
						ilike(customers.name, pattern),
						ilike(customers.email, pattern),
					),
				),
			)
			.orderBy(desc(customers.created_at))
			.limit(SEARCH_LIMIT);

		return c.json({ rows });
	},
});
