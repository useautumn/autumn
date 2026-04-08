import { member, user } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

/**
 * GET /admin/org-member
 *
 * Query params:
 * - org_id: The org ID to get a member for
 *
 * Returns the userId of a member of the org, preferring non-system-admin users
 * since admins cannot impersonate other admins.
 */
export const handleGetOrgMember = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const orgId = c.req.query("org_id");

		if (!orgId) {
			return c.json({ error: "org_id is required" }, 400);
		}

		// Find all members of the org with their user data
		const orgMembers = await db.query.member.findMany({
			where: eq(member.organizationId, orgId),
			with: { user: true },
		});

		if (!orgMembers || orgMembers.length === 0) {
			return c.json({ error: "No member found for org" }, 404);
		}

		// Prefer non-system-admin members (admins can't impersonate other admins)
		const nonAdminMember = orgMembers.find((m) => m.user?.role !== "admin");
		const targetMember = nonAdminMember ?? orgMembers[0];

		return c.json({ userId: targetMember.userId });
	},
});
