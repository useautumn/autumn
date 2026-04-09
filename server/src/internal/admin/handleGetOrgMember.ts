import { member, user } from "@autumn/shared";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

/**
 * GET /admin/org-member
 *
 * Query params:
 * - org_id: The org ID to get a member for
 *
 * Returns the userId of the first non-admin member of the org.
 */
export const handleGetOrgMember = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const orgId = c.req.query("org_id");

		if (!orgId) {
			return c.json({ error: "org_id is required" }, 400);
		}

		const orgMember = await db
			.select({
				userId: member.userId,
			})
			.from(member)
			.leftJoin(user, eq(member.userId, user.id))
			.where(
				and(
					eq(member.organizationId, orgId),
					or(isNull(user.role), ne(user.role, "admin")),
				),
			)
			.limit(1);

		if (orgMember.length === 0) {
			return c.json({ error: "No non-admin member found for org" }, 404);
		}

		return c.json({ userId: orgMember[0].userId });
	},
});
