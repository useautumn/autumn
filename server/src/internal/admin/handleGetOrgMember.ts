import { member, Scopes, user } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

/**
 * GET /admin/org-member
 *
 * Query params:
 * - org_id: The org ID to get a member for
 *
 * Returns the userId of the first non-admin member of the org, falling back to
 * any member for staff-only orgs (test orgs, internal sandboxes).
 */
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
			// Non-admin members first, so a real customer is preferred when one exists.
			.orderBy(sql`CASE WHEN ${user.role} = 'admin' THEN 1 ELSE 0 END`)
			.limit(1);

		if (!orgMember) {
			return c.json({ error: "No member found for org" }, 404);
		}

		return c.json({ userId: orgMember.userId });
	},
});
