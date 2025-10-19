import {
	type ApiPlatformOrg,
	type ListPlatformOrgsQuery,
	ListPlatformOrgsQuerySchema,
	organizations,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toPlatformOrg } from "./platformOrgUtils.js";

/**
 * Route: GET /platform/orgs - List organizations created by master org
 */
export const handleListPlatformOrgs = createRoute({
	query: ListPlatformOrgsQuerySchema,
	handler: async (c) => {
		const query = c.req.valid("query") as ListPlatformOrgsQuery;
		const ctx = c.get("ctx");
		const { db, org: masterOrg } = ctx;

		const orgs = await db
			.select()
			.from(organizations)
			.where(eq(organizations.created_by, masterOrg.id))
			.limit(query.limit)
			.offset(query.offset);

		const orgsList: ApiPlatformOrg[] = orgs.map((org) =>
			toPlatformOrg({
				org: {
					slug: org.slug,
					name: org.name,
					createdAt: org.createdAt,
				},
				masterOrgId: masterOrg.id,
			}),
		);

		return c.json({
			list: orgsList,
			total: orgs.length,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
