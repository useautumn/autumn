import { member } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

/**
 * GET /admin/org-member
 *
 * Query params:
 * - org_id: The org ID to get a member for
 *
 * Returns the userId of the first member of the org.
 */
export const handleGetOrgMember = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const orgId = c.req.query("org_id");

		if (!orgId) {
			return c.json({ error: "org_id is required" }, 400);
		}

		const orgMember = await db.query.member.findFirst({
			where: eq(member.organizationId, orgId),
		});

		if (!orgMember) {
			return c.json({ error: "No member found for org" }, 404);
		}

		return c.json({ userId: orgMember.userId });
	},
});
