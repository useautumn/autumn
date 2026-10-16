import { organizations, Scopes } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

/**
 * PATCH /admin/orgs/:org_id/approvals_enforced  body: { enabled }
 * The only way to turn approval enforcement on or off; the org config route refuses it.
 */
export const handleSetApprovalsEnforced = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({ org_id: z.string().min(1) }),
	body: z.object({ enabled: z.boolean() }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org_id: orgId } = c.req.param();
		const { enabled } = c.req.valid("json");
		await OrgService.get({ db: ctx.db, orgId });

		// Merged in the database so a concurrent config change is never overwritten.
		await ctx.db
			.update(organizations)
			.set({
				config: sql`COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ approvals_enforced: enabled })}::jsonb`,
			})
			.where(eq(organizations.id, orgId));
		await clearOrgCache({ db: ctx.db, orgId, logger: ctx.logger });

		return c.json({ org_id: orgId, approvals_enforced: enabled });
	},
});
