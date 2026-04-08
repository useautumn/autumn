import { organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

/**
 * GET /admin/org-by-slug
 *
 * Query params:
 * - slug: The org slug to resolve
 *
 * Returns the orgId for the given slug. Admin-only.
 */
export const handleGetOrgBySlug = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const slug = c.req.query("slug");

		if (!slug) {
			return c.json({ error: "slug is required" }, 400);
		}

		const org = await db.query.organizations.findFirst({
			where: eq(organizations.slug, slug),
			columns: { id: true },
		});

		if (!org) {
			return c.json({ error: "Organization not found" }, 404);
		}

		return c.json({ orgId: org.id });
	},
});
