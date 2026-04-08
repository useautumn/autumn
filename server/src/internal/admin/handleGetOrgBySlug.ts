import { organizations, RecaseError, ErrCode } from "@autumn/shared";
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
			throw new RecaseError({
				message: "slug is required",
				code: ErrCode.InvalidInputs,
				statusCode: 400,
			});
		}

		const org = await db.query.organizations.findFirst({
			where: eq(organizations.slug, slug),
			columns: { id: true },
		});

		if (!org) {
			throw new RecaseError({
				message: "Organization not found",
				code: ErrCode.OrgNotFound,
				statusCode: 404,
			});
		}

		return c.json({ orgId: org.id });
	},
});
