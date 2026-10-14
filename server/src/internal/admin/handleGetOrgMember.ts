import { member, Scopes, user } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleGetOrgMember = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const orgId = c.req.query("org_id");

		if (!orgId) {
			return c.json({ error: "org_id is required" }, 400);
		}

		const [orgMember] = await db
			.select({ userId: member.userId })
			.from(member)
			.leftJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, orgId))
			.orderBy(sql`CASE WHEN ${user.role} = 'admin' THEN 1 ELSE 0 END`)
			.limit(1);

		if (!orgMember) {
			return c.json({ error: "No member found for org" }, 404);
		}

		return c.json({ userId: orgMember.userId });
	},
});
