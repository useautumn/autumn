import { AppEnv, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

/**
 * POST /revenuecat/disconnect — remove the current env's RevenueCat connection
 * (OAuth tokens, project, api key). Keeps webhook_secret + mappings intact so a
 * reconnect reuses them.
 */
export const handleDisconnectRevenueCat = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const existing = org.processor_configs?.revenuecat;
		if (!existing) return c.json({ success: true });

		const next = { ...existing };
		if (env === AppEnv.Live) {
			next.oauth = undefined;
			next.project_id = undefined;
			next.api_key = undefined;
		} else {
			next.sandbox_oauth = undefined;
			next.sandbox_project_id = undefined;
			next.sandbox_api_key = undefined;
		}

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				processor_configs: { ...org.processor_configs, revenuecat: next },
			},
		});

		return c.json({ success: true });
	},
});
